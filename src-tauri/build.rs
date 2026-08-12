fn main() {
    // 前端产物变化时强制重编(Rust 编译期嵌入 dist, 否则增量构建会用旧资源)
    println!("cargo:rerun-if-changed=../dist");
    tauri_build::build();
}