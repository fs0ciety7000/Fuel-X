// Minimal typings for the Khronos glTF-Validator npm build (ships without .d.ts).
declare module 'gltf-validator' {
  export interface ValidatorMessage {
    code: string;
    message: string;
    severity: number; // 0 error, 1 warning, 2 info, 3 hint
    pointer?: string;
  }
  export interface ValidatorReport {
    issues: { numErrors: number; numWarnings: number; messages: ValidatorMessage[] };
  }
  export function validateBytes(
    data: Uint8Array,
    options?: { uri?: string; maxIssues?: number; ignoredIssues?: string[]; externalResourceFunction?: unknown },
  ): Promise<ValidatorReport>;
}
