import type { Binding } from "@web3d/document";

interface BindingActionCopy {
  readonly enabledAccessibleName: (pointer: string, bindingId: string) => string;
  readonly editAccessibleName: (pointer: string, bindingId: string) => string;
  readonly removeAccessibleName: (pointer: string, bindingId: string) => string;
}

export function bindingActionAccessibleNames(binding: Binding, copy: BindingActionCopy) {
  return {
    enabled: copy.enabledAccessibleName(binding.pointer, binding.id),
    edit: copy.editAccessibleName(binding.pointer, binding.id),
    remove: copy.removeAccessibleName(binding.pointer, binding.id),
  };
}
