use std::sync::{mpsc::Sender, Arc};

use super::{wav::AudioSpec, RecordingControl, Result, WriterCommand};

#[cfg(target_os = "macos")]
pub struct SystemAudioCapture {
    stream: screencapturekit::prelude::SCStream,
}

#[cfg(not(target_os = "macos"))]
pub struct SystemAudioCapture;

#[cfg(target_os = "macos")]
pub fn start(
    tx: Sender<WriterCommand>,
    control: Arc<RecordingControl>,
) -> Result<(SystemAudioCapture, AudioSpec)> {
    use std::sync::atomic::Ordering;

    use screencapturekit::prelude::*;

    let sample_rate = 48_000_u32;
    let channels = 2_u16;
    let content = SCShareableContent::get()
        .map_err(|error| super::RecordingError::Capture(format!("system audio permission/content failed: {error}")))?;
    let display = content
        .displays()
        .into_iter()
        .next()
        .ok_or_else(|| super::RecordingError::Capture("no capturable display found".to_string()))?;
    let filter = SCContentFilter::create()
        .with_display(&display)
        .with_excluding_windows(&[])
        .build();
    let config = SCStreamConfiguration::new()
        .with_width(2)
        .with_height(2)
        .with_captures_audio(true)
        .with_sample_rate(sample_rate as i32)
        .with_channel_count(i32::from(channels));

    let mut stream = SCStream::new(&filter, &config);
    stream.add_output_handler(
        move |sample: CMSampleBuffer, of_type: SCStreamOutputType| {
            if of_type != SCStreamOutputType::Audio
                || control.stopped.load(Ordering::SeqCst)
                || control.paused.load(Ordering::SeqCst)
            {
                return;
            }

            let _ = sample.make_data_ready();
            let Some(buffers) = sample.audio_buffer_list() else {
                return;
            };
            let samples = audio_buffers_to_f32(&buffers, usize::from(channels));
            if !samples.is_empty() {
                let _ = tx.send(WriterCommand::Samples(samples));
            }
        },
        SCStreamOutputType::Audio,
    );
    stream
        .start_capture()
        .map_err(|error| super::RecordingError::Capture(format!("system audio start failed: {error}")))?;

    Ok((
        SystemAudioCapture { stream },
        AudioSpec {
            sample_rate,
            channels,
        },
    ))
}

#[cfg(not(target_os = "macos"))]
pub fn start(
    _tx: Sender<WriterCommand>,
    _control: Arc<RecordingControl>,
) -> Result<(SystemAudioCapture, AudioSpec)> {
    Err(super::RecordingError::UnsupportedSource)
}

#[cfg(target_os = "macos")]
impl SystemAudioCapture {
    pub fn stop(self) -> Result<()> {
        self.stream
            .stop_capture()
            .map_err(|error| super::RecordingError::Capture(format!("system audio stop failed: {error}")))
    }
}

#[cfg(not(target_os = "macos"))]
impl SystemAudioCapture {
    pub fn stop(self) -> Result<()> {
        Ok(())
    }
}

#[cfg(target_os = "macos")]
fn audio_buffers_to_f32(
    buffers: &screencapturekit::cm::AudioBufferList,
    expected_channels: usize,
) -> Vec<f32> {
    let raw_buffers = buffers.iter().collect::<Vec<_>>();
    if raw_buffers.is_empty() {
        return Vec::new();
    }

    if raw_buffers.len() == 1 {
        return bytes_to_f32(raw_buffers[0].data());
    }

    let planar = raw_buffers
        .iter()
        .map(|buffer| bytes_to_f32(buffer.data()))
        .collect::<Vec<_>>();
    let frames = planar.iter().map(Vec::len).min().unwrap_or(0);
    let channels = expected_channels.min(planar.len()).max(1);
    let mut interleaved = Vec::with_capacity(frames * channels);
    for frame in 0..frames {
        for channel in 0..channels {
            interleaved.push(planar[channel][frame]);
        }
    }
    interleaved
}

#[cfg(target_os = "macos")]
fn bytes_to_f32(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(std::mem::size_of::<f32>())
        .map(|chunk| f32::from_ne_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect()
}
