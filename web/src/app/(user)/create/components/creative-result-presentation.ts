export function formatCreativeMessageTime(value: number) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    const now = new Date();
    const time = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
    if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()) return `今天 ${time}`;
    return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}
