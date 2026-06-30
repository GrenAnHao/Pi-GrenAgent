use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;

use crate::commands::knowledge::open_readonly;
use crate::commands::sessions::resolve_workspace_dir;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubAgentItem {
    pub id: String,
    pub task: String,
    pub status: String,
    pub model: Option<String>,
    /// 已解析能力档案的 JSON（含 fs/name 等），前端据此推断「类型（只读/工作）」。
    pub profile: Option<String>,
    pub output: Option<String>,
    pub error: Option<String>,
    pub exit_code: Option<i64>,
    /// 原始 `--mode json` JSONL transcript（运行期增量写入），前端据此实时回放子代理；旧库无该列时为 None。
    pub transcript: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

fn subagents_dir(workspace: &str) -> Result<PathBuf, String> {
    let cwd = resolve_workspace_dir(workspace)?;
    Ok(cwd.join(".pi").join("subagents"))
}

fn registry_db_path(workspace: &str) -> Result<PathBuf, String> {
    Ok(subagents_dir(workspace)?.join("registry.db"))
}

fn cancel_requests_path(workspace: &str) -> Result<PathBuf, String> {
    Ok(subagents_dir(workspace)?.join("cancel-requests.jsonl"))
}

fn read_subagent_list(path: &Path, limit: i64) -> Result<Vec<SubAgentItem>, String> {
    let Some(conn) = open_readonly(path)? else {
        return Ok(vec![]);
    };
    // 扩展端会频繁写心跳（touch）；只读端等待而非立刻报 SQLITE_BUSY。
    conn.busy_timeout(Duration::from_millis(500))
        .map_err(|e| e.to_string())?;
    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='subagents'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if exists == 0 {
        return Ok(vec![]);
    }
    // 旧库（v1）可能没有 transcript 列：先探测，缺列时用 `NULL as transcript` 占位，
    // 避免直接 SELECT transcript 触发 "no such column"（Rust 端只读，不负责迁移加列）。
    let has_transcript = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('subagents') WHERE name='transcript'",
            [],
            |r| r.get::<_, i64>(0),
        )
        .map(|c| c > 0)
        .unwrap_or(false);
    let sql = if has_transcript {
        "SELECT id, task, status, model, output, error, exitCode, createdAt, updatedAt, profile, transcript \
         FROM subagents ORDER BY createdAt DESC LIMIT ?1"
    } else {
        "SELECT id, task, status, model, output, error, exitCode, createdAt, updatedAt, profile, NULL as transcript \
         FROM subagents ORDER BY createdAt DESC LIMIT ?1"
    };
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([limit], |r| {
            Ok(SubAgentItem {
                id: r.get(0)?,
                task: r.get(1)?,
                status: r.get(2)?,
                model: r.get(3)?,
                output: r.get(4)?,
                error: r.get(5)?,
                exit_code: r.get(6)?,
                created_at: r.get(7)?,
                updated_at: r.get(8)?,
                profile: r.get(9)?,
                transcript: r.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn append_cancel_request(path: &Path, agent_id: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let line = serde_json::json!({ "agentId": agent_id, "at": at }).to_string() + "\n";
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    file.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn subagent_list(workspace: String) -> Result<Vec<SubAgentItem>, String> {
    read_subagent_list(&registry_db_path(&workspace)?, 50)
}

#[tauri::command]
pub fn subagent_cancel(workspace: String, agent_id: String) -> Result<(), String> {
    let id = agent_id.trim();
    if id.is_empty() {
        return Err("agentId is required".into());
    }
    append_cancel_request(&cancel_requests_path(&workspace)?, id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn tmp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("subagent-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn make_registry(path: &Path, rows: &[(&str, &str, &str)]) {
        let conn = Connection::open(path).unwrap();
        conn.execute_batch(
            "CREATE TABLE subagents(
               id TEXT PRIMARY KEY,
               task TEXT NOT NULL,
               profile TEXT,
               model TEXT,
               status TEXT NOT NULL,
               output TEXT,
               error TEXT,
               exitCode INTEGER,
               createdAt INTEGER NOT NULL,
               updatedAt INTEGER NOT NULL
             );",
        )
        .unwrap();
        for (id, task, status) in rows {
            conn.execute(
                "INSERT INTO subagents(id,task,profile,model,status,output,error,exitCode,createdAt,updatedAt)
                 VALUES(?1,?2,NULL,NULL,?3,NULL,NULL,NULL,100,100)",
                rusqlite::params![id, task, status],
            )
            .unwrap();
        }
    }

    #[test]
    fn list_reads_rows_desc() {
        let dir = tmp_dir();
        let db = dir.join("registry.db");
        make_registry(
            &db,
            &[("sa-1", "task a", "running"), ("sa-2", "task b", "done")],
        );
        let list = read_subagent_list(&db, 50).unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].id, "sa-1");
        assert_eq!(list[0].status, "running");
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn list_includes_profile_json() {
        let dir = tmp_dir();
        let db = dir.join("registry.db");
        {
            let conn = Connection::open(&db).unwrap();
            conn.execute_batch(
                "CREATE TABLE subagents(
                   id TEXT PRIMARY KEY,
                   task TEXT NOT NULL,
                   profile TEXT,
                   model TEXT,
                   status TEXT NOT NULL,
                   output TEXT,
                   error TEXT,
                   exitCode INTEGER,
                   createdAt INTEGER NOT NULL,
                   updatedAt INTEGER NOT NULL
                 );",
            )
            .unwrap();
            conn.execute(
                "INSERT INTO subagents(id,task,profile,model,status,output,error,exitCode,createdAt,updatedAt)
                 VALUES('sa-p','t','{\"name\":\"explore\",\"fs\":\"readonly\"}',NULL,'done',NULL,NULL,NULL,100,100)",
                [],
            )
            .unwrap();
        }
        let list = read_subagent_list(&db, 50).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(
            list[0].profile.as_deref(),
            Some("{\"name\":\"explore\",\"fs\":\"readonly\"}")
        );
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn missing_registry_is_empty() {
        let dir = tmp_dir();
        let list = read_subagent_list(&dir.join("missing.db"), 50).unwrap();
        assert!(list.is_empty());
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn append_cancel_request_writes_jsonl() {
        let dir = tmp_dir();
        let path = dir.join("cancel-requests.jsonl");
        append_cancel_request(&path, "sa-abc").unwrap();
        let raw = fs::read_to_string(&path).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(raw.trim()).unwrap();
        assert_eq!(parsed["agentId"], "sa-abc");
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn list_includes_transcript_when_column_present() {
        let dir = tmp_dir();
        let db = dir.join("registry.db");
        {
            let conn = Connection::open(&db).unwrap();
            conn.execute_batch(
                "CREATE TABLE subagents(
                   id TEXT PRIMARY KEY,
                   task TEXT NOT NULL,
                   profile TEXT,
                   model TEXT,
                   status TEXT NOT NULL,
                   output TEXT,
                   error TEXT,
                   exitCode INTEGER,
                   transcript TEXT,
                   createdAt INTEGER NOT NULL,
                   updatedAt INTEGER NOT NULL
                 );",
            )
            .unwrap();
            conn.execute(
                "INSERT INTO subagents(id,task,profile,model,status,output,error,exitCode,transcript,createdAt,updatedAt)
                 VALUES('sa-t','t',NULL,NULL,'running',NULL,NULL,NULL,'{\"type\":\"message_update\"}',100,100)",
                [],
            )
            .unwrap();
        }
        let list = read_subagent_list(&db, 50).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(
            list[0].transcript.as_deref(),
            Some("{\"type\":\"message_update\"}")
        );
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn list_handles_legacy_db_without_transcript_column() {
        // 旧库（无 transcript 列）走 `NULL as transcript` 分支：transcript 应为 None，不报 "no such column"。
        let dir = tmp_dir();
        let db = dir.join("registry.db");
        make_registry(&db, &[("sa-old", "task", "done")]);
        let list = read_subagent_list(&db, 50).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].transcript, None);
        fs::remove_dir_all(dir).ok();
    }
}
