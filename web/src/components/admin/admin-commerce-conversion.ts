const percentFormatter = new Intl.NumberFormat("zh-CN", {
    style: "percent",
    maximumFractionDigits: 1,
});

export function formatConversionRate(numerator: number, denominator: number) {
    return denominator > 0 ? percentFormatter.format(numerator / denominator) : "-";
}
