export function formatInr(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}
