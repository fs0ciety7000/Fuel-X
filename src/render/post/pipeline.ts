// Post-processing (5.7): RenderPass → one merged EffectPass (SMAA + halftone/dither) → screen. The canvas is created
// without MSAA (SMAA replaces it); buffers are 8-bit sRGB (postprocessing picks sRGB storage for UnsignedByteType
// with an sRGB output), so render targets stay ≈ 2 × 4 B/px. Resizes follow the canvas drawing buffer (adaptive DPR).
import { EffectComposer, EffectPass, RenderPass, SMAAEffect, SMAAPreset } from 'postprocessing';
import { Vector2 } from 'three';
import type { Camera, Scene, WebGLRenderer } from 'three';
import { HalftoneEffect } from './HalftoneEffect';

export class PostPipeline {
  readonly composer: EffectComposer;
  readonly halftone = new HalftoneEffect();
  private readonly renderPass: RenderPass;
  private readonly size = new Vector2();
  private readonly lastSize = new Vector2(-1, -1);
  private lastDpr = -1;

  constructor(
    private readonly gl: WebGLRenderer,
    scene: Scene,
    private camera: Camera,
  ) {
    this.composer = new EffectComposer(gl, { multisampling: 0 });
    this.renderPass = new RenderPass(scene, camera);
    const smaa = new SMAAEffect({ preset: SMAAPreset.HIGH });
    this.composer.addPass(this.renderPass);
    this.composer.addPass(new EffectPass(camera, smaa, this.halftone));
  }

  render(camera: Camera): void {
    if (camera !== this.camera) {
      this.camera = camera;
      this.composer.setMainCamera(camera);
    }
    const gl = this.gl;
    gl.getDrawingBufferSize(this.size);
    const dpr = gl.getPixelRatio();
    if (!this.size.equals(this.lastSize) || dpr !== this.lastDpr) {
      this.lastSize.copy(this.size);
      this.lastDpr = dpr;
      gl.getSize(this.size);
      this.composer.setSize(this.size.x, this.size.y, false);
      this.halftone.setPixelRatio(dpr);
    }
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
  }
}
