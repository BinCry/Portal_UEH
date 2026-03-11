const MOJIBAKE_PATTERN = /[ÃÂÄÆ][\x80-\xBF]?|áº|á»|Há»/;

export const repairMojibake = (value: string) => {
  if (!MOJIBAKE_PATTERN.test(value)) {
    return value;
  }

  try {
    const bytes = Uint8Array.from(Array.from(value).map((char) => char.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder("utf-8").decode(bytes);
    return decoded.includes("\uFFFD") ? value : decoded;
  } catch {
    return value;
  }
};

export const displayText = (value: string | null | undefined) =>
  value ? repairMojibake(value) : value;
