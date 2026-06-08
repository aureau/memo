use std::{
    fs::{self, File},
    io::BufWriter,
    path::PathBuf,
};

use super::RecordingError;

pub type Result<T> = std::result::Result<T, RecordingError>;

#[derive(Debug, Clone, Copy)]
pub struct AudioSpec {
    pub sample_rate: u32,
    pub channels: u16,
}

pub struct WavChunker {
    spec: AudioSpec,
    temp_dir: PathBuf,
    final_path: PathBuf,
    chunk_frames: u64,
    chunk_paths: Vec<PathBuf>,
    current_writer: Option<hound::WavWriter<BufWriter<File>>>,
    current_frames: u64,
    total_frames: u64,
}

impl WavChunker {
    pub fn new(
        spec: AudioSpec,
        temp_dir: PathBuf,
        final_path: PathBuf,
        chunk_frames: u64,
    ) -> Result<Self> {
        fs::create_dir_all(&temp_dir)?;
        if let Some(parent) = final_path.parent() {
            fs::create_dir_all(parent)?;
        }

        Ok(Self {
            spec,
            temp_dir,
            final_path,
            chunk_frames: chunk_frames.max(1),
            chunk_paths: Vec::new(),
            current_writer: None,
            current_frames: 0,
            total_frames: 0,
        })
    }

    pub fn push_interleaved_f32(&mut self, samples: &[f32]) -> Result<()> {
        let channels = usize::from(self.spec.channels.max(1));
        for frame in samples.chunks(channels) {
            if frame.len() < channels {
                break;
            }

            if self.current_writer.is_none() || self.current_frames >= self.chunk_frames {
                self.rotate_chunk()?;
            }

            let writer = self.current_writer.as_mut().expect("writer created above");
            for sample in frame {
                writer.write_sample(f32_to_i16(*sample))?;
            }
            self.current_frames += 1;
            self.total_frames += 1;
        }

        Ok(())
    }

    pub fn finalize(&mut self) -> Result<PathBuf> {
        self.finish_current()?;

        let spec = self.hound_spec();
        let mut final_writer = hound::WavWriter::create(&self.final_path, spec)?;
        for chunk in &self.chunk_paths {
            let mut reader = hound::WavReader::open(chunk)?;
            for sample in reader.samples::<i16>() {
                final_writer.write_sample(sample?)?;
            }
        }
        final_writer.finalize()?;

        if self.temp_dir.exists() {
            fs::remove_dir_all(&self.temp_dir)?;
        }

        Ok(self.final_path.clone())
    }

    pub fn discard(&mut self) -> Result<()> {
        self.finish_current()?;

        if self.temp_dir.exists() {
            fs::remove_dir_all(&self.temp_dir)?;
        }
        if self.final_path.exists() {
            fs::remove_file(&self.final_path)?;
        }

        Ok(())
    }

    pub fn total_frames(&self) -> u64 {
        self.total_frames
    }

    pub fn chunk_count(&self) -> usize {
        self.chunk_paths.len()
    }

    fn rotate_chunk(&mut self) -> Result<()> {
        self.finish_current()?;
        let path = self
            .temp_dir
            .join(format!("chunk_{:04}.wav", self.chunk_paths.len()));
        let writer = hound::WavWriter::create(&path, self.hound_spec())?;
        self.chunk_paths.push(path);
        self.current_writer = Some(writer);
        self.current_frames = 0;
        Ok(())
    }

    fn finish_current(&mut self) -> Result<()> {
        if let Some(writer) = self.current_writer.take() {
            writer.finalize()?;
        }
        self.current_frames = 0;
        Ok(())
    }

    fn hound_spec(&self) -> hound::WavSpec {
        hound::WavSpec {
            channels: self.spec.channels,
            sample_rate: self.spec.sample_rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        }
    }
}

fn f32_to_i16(sample: f32) -> i16 {
    let clamped = sample.clamp(-1.0, 1.0);
    (clamped * f32::from(i16::MAX)).round() as i16
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_paths(name: &str) -> (PathBuf, PathBuf) {
        let root = std::env::temp_dir().join(format!(
            "memo_recording_test_{}_{}",
            name,
            std::process::id()
        ));
        if root.exists() {
            fs::remove_dir_all(&root).unwrap();
        }
        (root.join("chunks.tmp"), root.join("audio.wav"))
    }

    #[test]
    fn chunker_rotates_and_finalizes_deterministically() {
        let (temp_dir, final_path) = test_paths("finalize");
        let mut chunker = WavChunker::new(
            AudioSpec {
                sample_rate: 4,
                channels: 1,
            },
            temp_dir.clone(),
            final_path.clone(),
            4,
        )
        .unwrap();

        chunker
            .push_interleaved_f32(&[0.0, 0.25, -0.25, 0.5, -0.5, 1.0, -1.0, 0.0, 0.1])
            .unwrap();

        assert_eq!(chunker.total_frames(), 9);
        assert_eq!(chunker.chunk_count(), 3);

        let finalized = chunker.finalize().unwrap();
        assert_eq!(finalized, final_path);
        assert!(!temp_dir.exists());

        let reader = hound::WavReader::open(finalized).unwrap();
        assert_eq!(reader.spec().sample_rate, 4);
        assert_eq!(reader.duration(), 9);
    }

    #[test]
    fn discard_removes_temp_and_final_files() {
        let (temp_dir, final_path) = test_paths("discard");
        let mut chunker = WavChunker::new(
            AudioSpec {
                sample_rate: 8,
                channels: 1,
            },
            temp_dir.clone(),
            final_path.clone(),
            8,
        )
        .unwrap();

        chunker.push_interleaved_f32(&[0.0; 8]).unwrap();
        chunker.discard().unwrap();

        assert!(!temp_dir.exists());
        assert!(!final_path.exists());
    }
}
