export function uniqueList(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function toNumberOrZero(value: unknown) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue >= 0 ? Number(numberValue.toFixed(2)) : 0;
}

export function toNumberOrOne(value: unknown) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue >= 0 ? Number(numberValue.toFixed(2)) : 1;
}

export function formatAdminMoney(cents: number, currency = "CNY") {
    const amount = (Number(cents || 0) / 100).toFixed(2);
    if (currency === "CNY") return "¥" + amount;
    if (currency === "USD") return "$" + amount;
    return amount + " " + currency;
}
