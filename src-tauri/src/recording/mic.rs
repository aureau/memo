use std::sync::{atomic::Ordering, mpsc::Sender, Arc};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

use super::{wav::AudioSpec, RecordingControl, RecordingError, Result, WriterCommand};

pub fn start(
    tx: Sender<WriterCommand>,
    control: Arc<RecordingControl>,
) -> Result<(cpal::Stream, AudioSpec)> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| RecordingError::Capture("no default microphone input device".to_string()))?;
    let supported_config = device
        .default_input_config()
        .map_err(|error| RecordingError::Capture(format!("microphone config failed: {error}")))?;
    let sample_rate = supported_config.sample_rate();
    let channels = supported_config.channels();
    let stream_config: cpal::StreamConfig = supported_config.clone().into();
    let err_fn = |error| eprintln!("microphone stream error: {error}");

    let stream = match supported_config.sample_format() {
        cpal::SampleFormat::F32 => build_stream(
            &device,
            stream_config.clone(),
            tx,
            control,
            err_fn,
            |sample: f32| sample,
        )?,
        cpal::SampleFormat::I16 => build_stream(
            &device,
            stream_config.clone(),
            tx,
            control,
            err_fn,
            |sample: i16| f32::from(sample) / f32::from(i16::MAX),
        )?,
        cpal::SampleFormat::U16 => build_stream(
            &device,
            stream_config,
            tx,
            control,
            err_fn,
            |sample: u16| (f32::from(sample) / f32::from(u16::MAX)) * 2.0 - 1.0,
        )?,
        other => {
            return Err(RecordingError::Capture(format!(
                "unsupported microphone sample format: {other:?}"
            )))
        }
    };

    stream
        .play()
        .map_err(|error| RecordingError::Capture(format!("microphone start failed: {error}")))?;

    Ok((
        stream,
        AudioSpec {
            sample_rate,
            channels,
        },
    ))
}

fn build_stream<T, F>(
    device: &cpal::Device,
    config: cpal::StreamConfig,
    tx: Sender<WriterCommand>,
    control: Arc<RecordingControl>,
    err_fn: impl FnMut(cpal::Error) + Send + 'static,
    convert: F,
) -> Result<cpal::Stream>
where
    T: cpal::SizedSample + Copy + Send + 'static,
    F: Fn(T) -> f32 + Send + Sync + 'static,
{
    device
        .build_input_stream(
            config,
            move |data: &[T], _| {
                if control.stopped.load(Ordering::SeqCst)
                    || control.paused.load(Ordering::SeqCst)
                {
                    return;
                }

                let samples = data.iter().copied().map(&convert).collect::<Vec<_>>();
                let _ = tx.send(WriterCommand::Samples(samples));
            },
            err_fn,
            None,
        )
        .map_err(|error| RecordingError::Capture(format!("microphone stream failed: {error}")))
}
