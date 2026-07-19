/**
 * Server-side QR generation for `/api/cards/*` (design doc §10.5: "QR codes generated
 * server-side (`qrcode` lib) into the card render" — "Every card renders the page URL + QR
 * (bottom strip)"). `qrcode` is a well-supported, dependency-light, pure-JS PNG/data-URI
 * generator — no native bindings, no canvas package, so it doesn't add anything to the
 * `runtime = 'nodejs'` OG/card routes' already-Node-only footprint (see `render.tsx`'s
 * SPEC-GAP note on why these routes aren't edge).
 *
 * Returns a `data:image/png;base64,...` URI so it can be dropped straight into a satori
 * `<img src=...>` (satori/`next/og` renders `<img>` `src` data URIs directly, no network
 * fetch — keeping the render fully self-contained, same posture as the OG barcode footer
 * that never fetches anything either).
 */
import QRCode from 'qrcode';

/**
 * Deterministic for a given `text` + `pixelSize` (no randomness in QR encoding) — same input,
 * same data URI, every time. `pixelSize` is the rendered module grid's pixel width; margin is
 * kept at the library default (4 modules) since a QR reader's finder-pattern quiet zone isn't a
 * purely cosmetic choice — trimming it can break scanability on some readers.
 */
export async function generateQrDataUri(text: string, pixelSize = 220): Promise<string> {
  return QRCode.toDataURL(text, {
    width: pixelSize,
    margin: 2,
    color: { dark: '#000000ff', light: '#ffffffff' },
  });
}
