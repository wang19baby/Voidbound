use std::path::PathBuf;
use voidbound_atlas_parser::*;

#[test]
fn dump_world_embedded_png() {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.pop(); p.pop(); p.push("output"); p.push("world.bin");
    let data = std::fs::read(&p).expect("read world.bin");
    let atlas = parse(&data).expect("parse world.bin");
    let out = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("world_embedded.png");
    std::fs::write(&out, &atlas.image_png).expect("save");
    println!("SAVED {}", out.display());
    println!("SPRITES");
    for s in &atlas.sprites {
        println!("{} x={} y={} w={} h={}", s.name, s.x, s.y, s.frame_width, s.frame_height);
    }
}