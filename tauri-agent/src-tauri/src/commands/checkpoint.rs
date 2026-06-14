use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

use crate::commands::knowledge::open_readonly;
use crate::commands::sessions::resolve_workspace_dir;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CpFile {
    pub file: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpItem {
    pub id: String,
    pub hash: String,
    pub label: String,
    pub kind: String,
    pub files: Vec<CpFile>,
    pub created_at: i64,
}

fn snapshots_base(workspace: &str) -> Result<PathBuf, String> {
    Ok(resolve_workspace_dir(workspace)?
        .join(".pi")
        .join("snapshots"))
}

fn read_cp_list(meta: &Path) -> Result<Vec<CpItem>, String> {
    let Some(conn) = open_readonly(meta)? else {
        return Ok(vec![]);
    };
    let mut stmt = conn
        .prepare("SELECT id, hash, label, kind, files, createdAt FROM checkpoints ORDER BY createdAt DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            let files_json: String = r.get(4).unwrap_or_default();
            let files: Vec<CpFile> = serde_json::from_str(&files_json).unwrap_or_default();
            Ok(CpItem {
                id: r.get(0)?,
                hash: r.get(1)?,
                label: r.get(2).unwrap_or_default(),
                kind: r.get(3)?,
                files,
                created_at: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command]
pub fn cp_list(workspace: String) -> Result<Vec<CpItem>, String> {
    read_cp_list(&snapshots_base(&workspace)?.join("meta.db"))
}

#[tauri::command]
pub fn cp_diff(workspace: String, id: String) -> Result<String, String> {
    let base = snapshots_base(&workspace)?;
    let cwd = resolve_workspace_dir(&workspace)?;
    let Some(conn) = open_readonly(&base.join("meta.db"))? else {
        return Ok(String::new());
    };
    let hash: String = conn
        .query_row("SELECT hash FROM checkpoints WHERE id = ?1", [&id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let gitdir = base.join("git");
    let output = Command::new("git")
        .args([
            "-c",
            "core.autocrlf=false",
            "-c",
            "core.longpaths=true",
            "-c",
            "core.quotepath=false",
            "--git-dir",
            gitdir.to_string_lossy().as_ref(),
            "--work-tree",
            cwd.to_string_lossy().as_ref(),
            "diff",
            &hash,
            "--",
            ".",
        ])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("git spawn failed: {e}"))?;
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn tmp_meta(rows: &[(&str, &str, &str, &str, &str, i64)]) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("cptest-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let db = dir.join("meta.db");
        let conn = Connection::open(&db).unwrap();
        conn.execute_batch(
            "CREATE TABLE checkpoints(id TEXT PRIMARY KEY, hash TEXT NOT NULL, label TEXT, kind TEXT NOT NULL, files TEXT, createdAt INTEGER NOT NULL);",
        )
        .unwrap();
        for (id, hash, label, kind, files, ts) in rows {
            conn.execute(
                "INSERT INTO checkpoints(id,hash,label,kind,files,createdAt) VALUES(?1,?2,?3,?4,?5,?6)",
                rusqlite::params![id, hash, label, kind, files, ts],
            )
            .unwrap();
        }
        db
    }

    #[test]
    fn list_reads_rows_desc_and_parses_files() {
        let db = tmp_meta(&[
            ("a1", "h1", "first", "auto", "[{\"file\":\"x.ts\",\"status\":\"M\"}]", 100),
            ("a2", "h2", "second", "manual", "[]", 200),
        ]);
        let rows = read_cp_list(&db).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].id, "a2"); // createdAt DESC
        assert_eq!(rows[1].files.len(), 1);
        assert_eq!(rows[1].files[0].file, "x.ts");
        std::fs::remove_dir_all(db.parent().unwrap()).ok();
    }

    #[test]
    fn list_missing_db_is_empty() {
        assert!(read_cp_list(std::path::Path::new("/no/such/meta.db"))
            .unwrap()
            .is_empty());
    }
}
