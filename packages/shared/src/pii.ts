// PII redaction at the storage boundary (Phase 6). Grading photos can capture faces
// or a shipping label with a home address; those must be redacted BEFORE the image is
// persisted. This is the interface every upload path goes through. The production
// implementation calls AWS Rekognition (DetectFaces / DetectText) + blurs the regions;
// the local stand-in is a documented no-op that records the decision so the boundary
// exists and is auditable. Same `redact()` contract either way.

export interface PiiRedactionResult {
  /** Whether any region was redacted. */
  redacted: boolean;
  /** Number of sensitive regions found (faces + address text). */
  regions: number;
  /** Honest provenance label for audit. */
  source: 'rekognition' | 'noop-stub';
  note: string;
}

export interface PiiRedactor {
  /** Redact PII from a base64 image, returning the (possibly modified) image + result. */
  redact(imageBase64: string): Promise<{ imageBase64: string; result: PiiRedactionResult }>;
}

/**
 * Local stand-in: passes the image through untouched but records that it crossed the
 * redaction boundary. Swap for a Rekognition-backed redactor in production without
 * changing any call site.
 */
export class NoopPiiRedactor implements PiiRedactor {
  // eslint-disable-next-line @typescript-eslint/require-await
  async redact(imageBase64: string): Promise<{ imageBase64: string; result: PiiRedactionResult }> {
    return {
      imageBase64,
      result: {
        redacted: false,
        regions: 0,
        source: 'noop-stub',
        note: 'Redaction boundary present; Rekognition face/text redaction runs here in production.',
      },
    };
  }
}
