// 沙箱（WSL2 + @anthropic-ai/sandbox-runtime）的就绪状态探测与引导安装。
//
// status：是否装了 WSL、是否有可用的 v2 发行版、发行版内是否有 srt/bwrap/socat。
// install：step="wsl" 跑 `wsl --install`（需管理员/重启）；step="deps" 在发行版内装
//          bubblewrap/socat/srt。两步分开，面板按状态引导。
use std::process::Stdio;
use tokio::process::Command;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxStatus {
    pub wsl: bool,
    pub distro: Option<String>,
    pub deps: bool,
    pub ready: bool,
}

// wsl.exe 输出 UTF-16LE；剔除 NUL 字节后 lossy 解码用于解析。
fn decode_wsl(bytes: &[u8]) -> String {
    let filtered: Vec<u8> = bytes.iter().copied().filter(|b| *b != 0).collect();
    String::from_utf8_lossy(&filtered).to_string()
}

// 选默认（或第一个）v2 发行版，跳过 docker-desktop。
fn pick_distro(list: &str) -> Option<String> {
    let mut fallback: Option<String> = None;
    for line in list.lines() {
        let t = line.trim();
        if t.is_empty() {
            continue;
        }
        let up = t.to_uppercase();
        if up.contains("NAME") && up.contains("VERSION") {
            continue;
        }
        let is_default = t.starts_with('*');
        let cleaned = t.trim_start_matches('*').trim();
        let cols: Vec<&str> = cleaned.split_whitespace().collect();
        if cols.len() < 3 {
            continue;
        }
        let name = cols[0].to_string();
        let version = cols[cols.len() - 1];
        if version != "2" || name == "docker-desktop" {
            continue;
        }
        if is_default {
            return Some(name);
        }
        if fallback.is_none() {
            fallback = Some(name);
        }
    }
    fallback
}

async fn list_distros() -> Option<String> {
    let out = Command::new("wsl.exe").args(["-l", "-v"]).output().await.ok()?;
    if !out.status.success() {
        return None;
    }
    Some(decode_wsl(&out.stdout))
}

/// 沙箱就绪状态：WSL / v2 发行版 / 依赖。
#[tauri::command]
pub async fn sandbox_status() -> Result<SandboxStatus, String> {
    if !cfg!(windows) {
        return Ok(SandboxStatus { wsl: false, distro: None, deps: false, ready: false });
    }
    let Some(list) = list_distros().await else {
        return Ok(SandboxStatus { wsl: false, distro: None, deps: false, ready: false });
    };
    let Some(distro) = pick_distro(&list) else {
        return Ok(SandboxStatus { wsl: true, distro: None, deps: false, ready: false });
    };
    let deps_out = Command::new("wsl.exe")
        .args([
            "-d",
            &distro,
            "--",
            "bash",
            "-lc",
            "command -v srt bwrap socat rg >/dev/null && echo OK",
        ])
        .stdin(Stdio::null())
        .output()
        .await
        .map_err(|e| format!("wsl 依赖探测失败: {e}"))?;
    let deps = decode_wsl(&deps_out.stdout).contains("OK");
    Ok(SandboxStatus { wsl: true, distro: Some(distro), deps, ready: deps })
}

/// 引导安装：step = "wsl"（装 WSL，需管理员/重启）或 "deps"（发行版内装依赖）。
#[tauri::command]
pub async fn sandbox_install(step: String) -> Result<String, String> {
    if !cfg!(windows) {
        return Err("沙箱仅在 Windows + WSL2 上支持".to_string());
    }
    match step.as_str() {
        "wsl" => {
            let out = Command::new("wsl.exe")
                .args(["--install"])
                .stdin(Stdio::null())
                .output()
                .await
                .map_err(|e| format!("wsl --install 启动失败: {e}"))?;
            let msg = format!("{}{}", decode_wsl(&out.stdout), decode_wsl(&out.stderr));
            Ok(format!(
                "{}\n（如需管理员权限或提示重启，请按提示重启后再点「装依赖」）",
                msg.trim()
            ))
        }
        "deps" => {
            let list = list_distros()
                .await
                .ok_or_else(|| "无可用的 WSL2 发行版（请先安装 WSL）".to_string())?;
            let distro =
                pick_distro(&list).ok_or_else(|| "无可用的 WSL2 发行版（请先安装 WSL）".to_string())?;
            // 以 root 运行（wsl -u root）→ 无需 sudo 密码，全自动一键。装 apt 依赖
            // （bubblewrap/socat/ripgrep）；缺 npm 则一并装 nodejs/npm；再全局装 srt。
            // 幂等：已装的 apt 包跳过，npm i -g 重装无害。stdin=null 防任何意外交互挂起。
            let script = "set -e; export DEBIAN_FRONTEND=noninteractive; \
                 apt-get update; \
                 apt-get install -y bubblewrap socat ripgrep; \
                 command -v npm >/dev/null 2>&1 || apt-get install -y nodejs npm; \
                 npm i -g @anthropic-ai/sandbox-runtime; \
                 echo SANDBOX_DEPS_DONE";
            let out = Command::new("wsl.exe")
                .args(["-d", &distro, "-u", "root", "--", "bash", "-lc", script])
                .stdin(Stdio::null())
                .output()
                .await
                .map_err(|e| format!("依赖安装失败: {e}"))?;
            let stdout = decode_wsl(&out.stdout);
            if !out.status.success() || !stdout.contains("SANDBOX_DEPS_DONE") {
                return Err(format!(
                    "依赖安装失败（{distro}）：{}",
                    decode_wsl(&out.stderr).trim()
                ));
            }
            Ok(format!("依赖安装完成（{distro}）"))
        }
        other => Err(format!("未知安装步骤: {other}")),
    }
}
