const INTEGRAL_UNIFORMS = new Set([
    'corners_bottom',
    'corners_top',
    'divider',
    'downsampling_mode',
    'factor',
    'mode',
    'operation',
    'straight_corners',
    'texture_repeat',
    'octaves',
    'vapor_octaves',
]);

export function set_uniform(effect, name, value) {
    if (!effect._tahoe_uniforms)
        effect._tahoe_uniforms = new Map();

    if (effect._tahoe_uniforms.get(name) === value)
        return;
    effect._tahoe_uniforms.set(name, value);
    effect._tahoe_uniforms_dirty = true;
    effect.queue_repaint();
}

export function mark_dirty(effect) {
    if (effect._tahoe_uniforms)
        effect._tahoe_uniforms_dirty = true;
}

/// Uploads the uniforms changed since the last paint, must be called while painting.
export function upload_uniforms(effect) {
    if (!effect._tahoe_uniforms_dirty)
        return;

    for (const [name, value] of effect._tahoe_uniforms)
        effect.set_surface_uniform(name, value, INTEGRAL_UNIFORMS.has(name));

    effect._tahoe_uniforms_dirty = false;
}
