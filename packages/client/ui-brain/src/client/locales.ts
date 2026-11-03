/** Concise account and conversation controls. @module */
export const en = {
  projects: 'Projects', newProject: 'New project', instructions: 'Instructions', upload: 'Upload files', uploadFailed: 'Upload failed',
  partial: 'Partial', executionFailed: 'Failed', cancelled: 'Cancelled', interrupted: 'Interrupted',
  tasks: 'Scheduled tasks', newTask: 'New task', name: 'Name', prompt: 'Prompt', model: 'Model', frequency: 'Frequency', interval: 'Interval', anchor: 'Start', timezone: 'Time zone', enabled: 'Enabled', save: 'Save', runNow: 'Run now', saved: 'Saved', queued: 'Queued', minutely: 'Minutes', hourly: 'Hours', daily: 'Days', weekly: 'Weeks', monthly: 'Months', quarterly: 'Quarters', yearly: 'Years',
  tools: 'Tools', noTools: 'No tools executed', running: 'Running', completed: 'Completed',
  brand: 'Brain', research: 'Deep search', mode: 'Mode', chat: 'Chat', moa: 'MoA', project: 'Project', noProject: 'No project',
  privacy: 'Privacy', signOut: 'Sign out', loading: 'Loading', failed: 'Could not load data',
  saveFailed: 'Could not save changes', refresh: 'Refresh', close: 'Close', unknown: 'Unknown',
  findings: 'Findings', identities: 'Identities', replacements: 'Replacements', noPrivacy: 'No privacy data yet',
} as const
/** Keys shared by all Brain control dictionaries. */
export type BrainKey = keyof typeof en
/** German control labels. */
export const de: Record<BrainKey, string> = {
  projects: 'Projekte', newProject: 'Neues Projekt', instructions: 'Anweisungen', upload: 'Dateien hochladen', uploadFailed: 'Hochladen fehlgeschlagen',
  partial: 'Teilweise', executionFailed: 'Fehlgeschlagen', cancelled: 'Abgebrochen', interrupted: 'Unterbrochen',
  tasks: 'Geplante Aufgaben', newTask: 'Neue Aufgabe', name: 'Name', prompt: 'Auftrag', model: 'Modell', frequency: 'Häufigkeit', interval: 'Intervall', anchor: 'Beginn', timezone: 'Zeitzone', enabled: 'Aktiviert', save: 'Speichern', runNow: 'Jetzt ausführen', saved: 'Gespeichert', queued: 'Eingereiht', minutely: 'Minuten', hourly: 'Stunden', daily: 'Tage', weekly: 'Wochen', monthly: 'Monate', quarterly: 'Quartale', yearly: 'Jahre',
  tools: 'Werkzeuge', noTools: 'Keine Werkzeuge ausgeführt', running: 'Läuft', completed: 'Abgeschlossen',
  brand: 'Brain', research: 'Tiefenrecherche', mode: 'Modus', chat: 'Chat', moa: 'MoA', project: 'Projekt', noProject: 'Kein Projekt',
  privacy: 'Datenschutz', signOut: 'Abmelden', loading: 'Wird geladen', failed: 'Daten konnten nicht geladen werden',
  saveFailed: 'Änderungen konnten nicht gespeichert werden', refresh: 'Aktualisieren', close: 'Schließen', unknown: 'Unbekannt',
  findings: 'Funde', identities: 'Identitäten', replacements: 'Ersetzungen', noPrivacy: 'Noch keine Datenschutzdaten',
}

/** Chinese control labels. */
export const zh: Record<BrainKey, string> = {
  projects: '项目', newProject: '新建项目', instructions: '指示', upload: '上传文件', uploadFailed: '上传失败',
  partial: '部分完成', executionFailed: '失败', cancelled: '已取消', interrupted: '已中断',
  tasks: '计划任务', newTask: '新建任务', name: '名称', prompt: '指令', model: '模型', frequency: '频率', interval: '间隔', anchor: '开始', timezone: '时区', enabled: '启用', save: '保存', runNow: '立即运行', saved: '已保存', queued: '已排队', minutely: '分钟', hourly: '小时', daily: '天', weekly: '周', monthly: '月', quarterly: '季度', yearly: '年',
  tools: '工具', noTools: '未执行工具', running: '运行中', completed: '已完成',
  brand: 'Brain', research: '深度搜索', mode: '模式', chat: '对话', moa: 'MoA', project: '项目', noProject: '无项目',
  privacy: '隐私', signOut: '退出登录', loading: '加载中', failed: '无法加载数据',
  saveFailed: '无法保存更改', refresh: '刷新', close: '关闭', unknown: '未知',
  findings: '发现', identities: '身份', replacements: '替换', noPrivacy: '暂无隐私数据',
}
