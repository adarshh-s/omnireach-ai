import Busboy from 'busboy';
import type { IncomingMessage } from 'http';

/**
 * Parses a multipart/form-data request body into plain string fields. SendGrid's Inbound
 * Parse webhook always POSTs as multipart/form-data (from, to, subject, text, html, etc.
 * as individual fields) — never JSON — so this is required to read it.
 *
 * Must be called before anything else consumes the request stream (e.g. Express's
 * express.json() middleware skips non-JSON content types and leaves the stream untouched,
 * so this is safe to call from a route handler as-is).
 */
export function parseMultipartFields(req: IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('multipart/form-data')) {
      resolve({});
      return;
    }

    const busboy = Busboy({ headers: { 'content-type': contentType } });
    const fields: Record<string, string> = {};

    busboy.on('field', (name, value) => {
      fields[name] = value;
    });
    busboy.on('file', (_name, file) => {
      file.resume(); // discard any attachments — not handled in this pass
    });
    busboy.on('close', () => resolve(fields));
    busboy.on('error', reject);

    req.pipe(busboy);
  });
}
