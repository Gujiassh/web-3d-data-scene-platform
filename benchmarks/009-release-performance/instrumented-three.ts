import type { Camera, Scene, WebGLRenderer as RendererType, WebGLRendererParameters } from "three";

// @ts-expect-error The benchmark aliases this implementation path while public types still come from three.
import { WebGLRenderer as ProductionWebGLRenderer } from "../../packages/runtime/node_modules/three/build/three.module.js";

// @ts-expect-error See the implementation-path note above.
export * from "../../packages/runtime/node_modules/three/build/three.module.js";

const Renderer = ProductionWebGLRenderer as typeof RendererType;

interface RendererHook {
  onRender(renderer: RendererType): void;
  onDispose(renderer: RendererType): void;
}

export class WebGLRenderer extends Renderer {
  constructor(parameters?: WebGLRendererParameters) {
    super(parameters);
    const render = this.render.bind(this);
    const dispose = this.dispose.bind(this);
    this.render = (scene: Scene, camera: Camera): void => {
      render(scene, camera);
      rendererHook()?.onRender(this);
    };
    this.dispose = (): void => {
      dispose();
      rendererHook()?.onDispose(this);
    };
  }
}

function rendererHook(): RendererHook | undefined {
  return (
    globalThis as typeof globalThis & {
      __WEB3D_BENCHMARK_RENDERER_HOOK__?: RendererHook;
    }
  ).__WEB3D_BENCHMARK_RENDERER_HOOK__;
}
