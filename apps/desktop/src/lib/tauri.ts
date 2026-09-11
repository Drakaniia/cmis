import { invoke } from "@tauri-apps/api/core";

// todo: add typed invoke wrappers per Rust command
// todo: example: export const getRecords = () => invoke<Record[]>("get_records");
// todo: generate types via tauri-specta when backend stabilizes

export { invoke };
