const encoder = new TextEncoder();

/** UTF-8 byte length of `s`. */
export function utf8ByteLength(s: string): number {
	return encoder.encode(s).length;
}

/** Encode `s` to UTF-8 bytes; throws if longer than `maxBytes`. */
export function requireUtf8MaxBytes(s: string, maxBytes: number, label: string): Uint8Array {
	const bytes = encoder.encode(s);
	if (bytes.length > maxBytes) {
		throw new Error(
			`${label} is too long (${bytes.length} bytes; max ${maxBytes} UTF-8 bytes).`,
		);
	}
	return bytes;
}
