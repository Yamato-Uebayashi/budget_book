#[cfg_attr(mobile, tauri::mobile_entry_point)]
fn main() {
    budget_book_lib::run()
}
