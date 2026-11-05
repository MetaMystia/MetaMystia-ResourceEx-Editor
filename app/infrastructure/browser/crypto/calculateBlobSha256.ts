import 'client-only';

export async function calculateBlobSha256(blob: Blob): Promise<string> {
	const digest = await crypto.subtle.digest(
		'SHA-256',
		await blob.arrayBuffer()
	);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, '0')
	).join('');
}
