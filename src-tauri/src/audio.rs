// 音频模块: 简单 SFX 播放 (rodio)
// OutputStream 在 Windows WASAPI 下 !Send, 用独立 audio 线程持有
// 消息队列: 命令线程发消息, audio 线程处理 (play / set_volume / load)

use std::collections::HashMap;
use std::io::Cursor;
use std::path::PathBuf;
use std::sync::mpsc::Sender;
use std::sync::OnceLock;
use std::thread;

use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink};

const SFX_LIST: &[&str] = &["fireball", "hit", "swing", "die"];

pub enum AudioMsg {
    Play(String),
    SetVolume(f32),
}

pub struct AudioHandle {
    pub tx: Sender<AudioMsg>,
}

static HANDLE: OnceLock<OutputStreamHandle> = OnceLock::new();

fn sfx_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("assets")
        .join("sfx")
        .join(format!("{name}.wav"))
}

/// 在独立线程初始化 audio + 处理消息
fn spawn_audio_thread() -> Sender<AudioMsg> {
    let (tx, rx) = std::sync::mpsc::channel::<AudioMsg>();
    thread::spawn(move || {
        let (stream, handle) = match OutputStream::try_default() {
            Ok(s) => s,
            Err(e) => {
                log::error!("audio thread init failed: {e}");
                return;
            }
        };
        HANDLE.set(handle.clone()).ok();
        let _keep_stream_alive = stream; // must not drop

        // 预加载
        let mut cache: HashMap<String, Vec<u8>> = HashMap::new();
        for name in SFX_LIST {
            let p = sfx_path(name);
            if p.exists() {
                if let Ok(bytes) = std::fs::read(&p) {
                    cache.insert(name.to_string(), bytes);
                }
            }
        }
        let mut volume = 0.5f32;
        log::info!("audio thread: {} SFX loaded", cache.len());

        for msg in rx {
            match msg {
                AudioMsg::Play(name) => {
                    if let Some(bytes) = cache.get(&name) {
                        let cursor = Cursor::new(bytes.clone());
                        if let Ok(source) = Decoder::new(cursor) {
                            if let Ok(sink) = Sink::try_new(&handle) {
                                sink.set_volume(volume);
                                sink.append(source);
                                sink.detach();
                            }
                        }
                    }
                }
                AudioMsg::SetVolume(v) => { volume = v.clamp(0.0, 1.0); }
            }
        }
    });
    tx
}

static TX: OnceLock<Sender<AudioMsg>> = OnceLock::new();

fn ensure_audio() -> Sender<AudioMsg> {
    TX.get_or_init(spawn_audio_thread).clone()
}

#[tauri::command]
pub fn play_sfx(name: String) -> Result<(), String> {
    let tx = ensure_audio();
    tx.send(AudioMsg::Play(name)).map_err(|e| format!("audio: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn set_volume(vol: f32) -> Result<(), String> {
    let tx = ensure_audio();
    tx.send(AudioMsg::SetVolume(vol)).map_err(|e| format!("audio: {e}"))?;
    Ok(())
}

pub fn setup(_app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    ensure_audio();
    Ok(())
}