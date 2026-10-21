#!/usr/bin/env bash
# opencode 监控台管理脚本
# 用法：./server.sh install|build|start|stop|restart|status|test|logs [-f]
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PORT="${MONITOR_PORT:-7788}"
HOST="${MONITOR_HOST:-127.0.0.1}"
URL="http://${HOST}:${PORT}"
PIDFILE="/tmp/opencode/monitor.pid"
LOG="/tmp/opencode/monitor.log"
mkdir -p /tmp/opencode

# 端口上真正监听的进程 pid（pidfile 丢失或进程换了时的兜底）
port_pid() {
  ss -ltnp 2>/dev/null | grep ":${PORT} " | grep -o "pid=[0-9]*" | head -1 | cut -d= -f2
}

running() {
  [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null
}

cmd_install() {
  echo "== npm install（含 tailwind CLI 与 jsdom）=="
  npm install
  cmd_build
}

cmd_build() {
  echo "== 编译静态 Tailwind CSS =="
  bash styles/build.sh
}

cmd_start() {
  if running; then
    echo "已经在跑：pid $(cat "$PIDFILE") → ${URL}"
    return 0
  fi
  local p
  p="$(port_pid)"
  if [[ -n "$p" ]]; then
    echo "端口 ${PORT} 被别的进程（pid ${p}）占用；先停掉它，或设 MONITOR_PORT 换端口"
    return 1
  fi
  echo "== 启动监控（日志 ${LOG}）=="
  nohup node src/server.js >>"$LOG" 2>&1 &
  echo $! >"$PIDFILE"
  for _ in {1..20}; do
    if curl -sf --max-time 2 "${URL}/api/health" >/dev/null 2>&1; then
      echo "已启动：pid $(cat "$PIDFILE") → ${URL}"
      cmd_status
      return 0
    fi
    sleep 0.5
  done
  echo "启动没就绪，看日志最后几行："
  tail -n 8 "$LOG"
  return 1
}

cmd_stop() {
  if running; then
    kill "$(cat "$PIDFILE")" && echo "已停止：pid $(cat "$PIDFILE")"
  fi
  rm -f "$PIDFILE"
  # 兜底：pidfile 里没有但端口还被人占着（比如手工启的旧进程）
  local p
  p="$(port_pid)"
  if [[ -n "$p" ]]; then
    kill "$p" && echo "已停止端口上的进程：pid ${p}"
  fi
  if [[ -z "$(port_pid)" ]]; then
    echo "端口 ${PORT} 已空闲"
  else
    echo "端口 ${PORT} 仍被占用（pid $(port_pid)），可能需要 sudo kill"
    return 1
  fi
}

cmd_restart() {
  cmd_stop
  cmd_start
}

cmd_status() {
  if running; then
    echo "运行中：pid $(cat "$PIDFILE") → ${URL}"
  else
    local p
    p="$(port_pid)"
    if [[ -n "$p" ]]; then
      echo "没走本脚本启动，但端口上有进程：pid ${p} → ${URL}"
    else
      echo "没在跑。启动：./server.sh start"
      return 0
    fi
  fi
  curl -s --max-time 3 "${URL}/api/health" | python3 -c "
import sys, json
d = json.load(sys.stdin)
o = d.get('opencode', {})
s = d.get('strata', {})
print('  opencode: %s 连通=%s 版本=%s pid=%s' % (o.get('url'), o.get('reachable'), o.get('version'), o.get('pid')))
print('  strata:   %s 连通=%s' % (s.get('url'), s.get('alive')))
print('  会话数: %s' % d.get('sessions'))
" 2>/dev/null || echo "  /api/health 没响应"
}

cmd_test() {
  if ! running; then
    echo "== 测试需要服务在跑，先启动 =="
    cmd_start || return 1
  fi
  npm test
}

cmd_logs() {
  if [[ "${1:-}" == "-f" ]]; then
    tail -n 40 -f "$LOG"
  else
    tail -n 40 "$LOG"
  fi
}

case "${1:-}" in
  install) cmd_install ;;
  build)   cmd_build ;;
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_restart ;;
  status)  cmd_status ;;
  test)    cmd_test ;;
  logs)    cmd_logs "${2:-}" ;;
  *)
    echo "用法: ./server.sh install|build|start|stop|restart|status|test|logs [-f]"
    echo "环境变量: MONITOR_PORT（默认 7788） MONITOR_HOST（默认 127.0.0.1） STRATA_URL（默认 http://127.0.0.1:8080）"
    exit 1
    ;;
esac
