import type { R3FReporter } from './reporter';

let _reporter: R3FReporter | null = null;

export function _setReporter(r: R3FReporter | null): void {
  _reporter = r;
}

export function _getReporter(): R3FReporter | null {
  return _reporter;
}
