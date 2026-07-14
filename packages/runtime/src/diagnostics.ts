import type { Diagnostic, DiagnosticCode, DiagnosticSeverity } from "./types";

export class RuntimeDiagnosticError extends Error {
  readonly diagnostic: Diagnostic;

  constructor(diagnostic: Diagnostic, options?: ErrorOptions) {
    super(diagnostic.message, options);
    this.name = "RuntimeDiagnosticError";
    this.diagnostic = diagnostic;
  }
}

export function diagnostic(
  code: DiagnosticCode,
  source: Diagnostic["source"],
  severity: DiagnosticSeverity,
  message: string,
  context: Omit<Diagnostic, "code" | "source" | "severity" | "message"> = {},
): Diagnostic {
  return { code, source, severity, message, ...context };
}

export function diagnosticError(value: Diagnostic, cause?: unknown): RuntimeDiagnosticError {
  return new RuntimeDiagnosticError(value, cause === undefined ? undefined : { cause });
}
