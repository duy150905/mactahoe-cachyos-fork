/*
 * Open App Animation for GNOME Shell
 *
 * Magic Lamp effect, based on Compiz-alike-magic-lamp-effect
 * Copyright (C) 2020 Mauro Pepe <https://github.com/hermes83/compiz-alike-magic-lamp-effect>
 * Modifications (C) 2026 duy150905: effect classes moved into their own module,
 * unique GType names, completion callback instead of patching the window manager
 * from inside the effect.
 *
 * This file is part of the gnome-shell extension Open App Animation.
 *
 * gnome-shell extension Open App Animation is free software: you can
 * redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * gnome-shell extension Open App Animation is distributed in the hope that it
 * will be useful, but WITHOUT ANY WARRANTY; without even the
 * implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR
 * PURPOSE.  See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with gnome-shell extension Open App Animation.  If not, see
 * <http://www.gnu.org/licenses/>.
 */
'use strict';

import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export const MINIMIZE_EFFECT_NAME = 'open-app-animation-minimize-lamp';
export const UNMINIMIZE_EFFECT_NAME = 'open-app-animation-unminimize-lamp';

class AbstractCommonMagicLampEffect extends Clutter.DeformEffect {
    static {
        GObject.registerClass({GTypeName: 'OpenAppAnimationLampBase'}, this);
    }    

    _init(params = {}) {
        super._init();

        this.settingsData = params.settingsData;
        this.onDone = params.onDone || null;
        this._done = false;

        this.EPSILON = 40;

        this.isMinimizeEffect = false;
        this.newFrameEvent = null;
        this.completedEvent = null;
        
        this.timerId = null;
        this.msecs = 0;

        this.monitor = {x: 0, y: 0, width: 0, height: 0};
        this.iconMonitor = {x: 0, y: 0, width: 0, height: 0};
        this.window = {x: 0, y: 0, width: 0, height: 0, scale: 1};
        this.icon = params.icon;
        
        this.progress = 0;
        this.split = 0.3;
        this.k = 0;
        this.j = 0;
        this.expandWidth = 0;
        this.fullWidth = 0;
        this.expandHeight = 0;
        this.fullHeight = 0;
        this.width = 0;
        this.height = 0;
        this.x = 0;
        this.y = 0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.effectX = 0;
        this.effectY = 0;
        this.iconPosition = null;

        this.toTheBorder = true;   // true
        this.maxIconSize = null;    // 48
        this.alignIcon = 'center';  // 'left-top'

        this.EFFECT = this.settingsData.EFFECT.get(); //'default' - 'sine'
        this.DURATION = this.settingsData.DURATION.get();
        this.X_TILES = this.settingsData.X_TILES.get();
        this.Y_TILES = this.settingsData.Y_TILES.get();

        this.initialized = false;
    }

    destroy_actor(actor) {
        // Gọi đúng một lần, kể cả khi destroy() bị gọi hai lần.
        if (this._done) {
            return;
        }
        this._done = true;
        if (this.onDone) {
            this.onDone(actor);
        }
    }

    on_tick_elapsed(timer, msecs) {}

    vfunc_set_actor(actor) {
        super.vfunc_set_actor(actor);

        if (!this.actor || this.initialized) {
            return;
        }

        this.initialized = true;
        
        this.monitor = Main.layoutManager.monitors[actor.meta_window.get_monitor()];

        [this.window.x, this.window.y] = [this.actor.get_x() - this.monitor.x, this.actor.get_y() - this.monitor.y];
        [this.window.width, this.window.height] = actor.get_size();
        
        if (!this.icon || (this.icon.x == 0 && this.icon.y == 0 && this.icon.width == 0 && this.icon.height == 0)) {
            this.icon.x = this.monitor.x + this.monitor.width / 2;
            this.icon.y = this.monitor.height + this.monitor.y;
        }

        Main.layoutManager.monitors.forEach((monitor, monitorIndex)  => {
            let scale = 1;
            if (global.display && global.display.get_monitor_scale) {
                scale = global.display.get_monitor_scale(monitorIndex);
            }

            if (this.icon.x >= monitor.x && this.icon.x <= monitor.x + monitor.width * scale && this.icon.y >= monitor.y && this.icon.y <= monitor.y + monitor.height * scale)  {
                this.iconMonitor = monitor;
            }
        });
        if (this.iconMonitor.x == 0 && this.iconMonitor.y == 0 && this.iconMonitor.width == 0 && this.iconMonitor.height == 0) {
            this.iconMonitor = this.monitor;
            // this.icon.x = this.monitor.x + this.monitor.width / 2;
            // this.icon.y = this.monitor.height + this.monitor.y;
        }

        [this.icon.x, this.icon.y, this.icon.width, this.icon.height] = [this.icon.x - this.monitor.x, this.icon.y - this.monitor.y, this.icon.width, this.icon.height];

        if (this.icon.y + this.icon.height >= this.monitor.height - this.EPSILON) {
            this.iconPosition = St.Side.BOTTOM;
            if (this.toTheBorder) {
                this.icon.y = this.iconMonitor.y + this.iconMonitor.height - this.monitor.y
                this.icon.height = 0;
            }
        } else if (this.icon.x <= this.EPSILON) {
            this.iconPosition = St.Side.LEFT;
            if (this.toTheBorder) {
                this.icon.x = this.iconMonitor.x - this.monitor.x;
                this.icon.width = 0;
            }
        } else if (this.icon.x + this.icon.width >= this.monitor.width - this.EPSILON) {
            this.iconPosition = St.Side.RIGHT;
            if (this.toTheBorder) {
                this.icon.x = this.iconMonitor.x + this.iconMonitor.width - this.monitor.x;
                this.icon.width = 0;
            }
        } else {
            this.iconPosition = St.Side.TOP;
            if (this.toTheBorder) {
                this.icon.y = this.iconMonitor.y - this.monitor.y;
                this.icon.height = 0;
            }
        }

        this.set_n_tiles(this.X_TILES, this.Y_TILES);
        
        this.timerId = new Clutter.Timeline({ actor: this.actor, duration: this.DURATION + (this.monitor.width * this.monitor.height) / (this.window.width * this.window.height) });
        this.newFrameEvent = this.timerId.connect('new-frame', this.on_tick_elapsed.bind(this));
        this.completedEvent = this.timerId.connect('completed', this.destroy.bind(this));
        this.timerId.start();
    }

    destroy() {
        if (this.timerId) {
            if (this.newFrameEvent) {
                this.timerId.disconnect(this.newFrameEvent);
                this.newFrameEvent = null;
            }
            if (this.completedEvent) {
                this.timerId.disconnect(this.completedEvent);
                this.completedEvent = null;
            }
            this.timerId = null;
        }

        let actor = this.get_actor();
        if (actor) {
            if (this.paintEvent) {
                actor.disconnect(this.paintEvent);
                this.paintEvent = null;
            }
            actor.remove_effect(this);

            this.destroy_actor(actor);
        }
    }

    vfunc_deform_vertex(w, h, v) {
        if (this.initialized) {
            let propX = w / this.window.width;
            let propY = h / this.window.height;

            if (this.iconPosition == St.Side.LEFT) {
                this.width = this.window.width - this.icon.width + this.window.x * this.k;

                this.x = (this.width - this.j * this.width) * v.tx;  
                this.y = v.ty * this.window.height * (this.x + (this.width - this.x) * (1 - this.k)) / this.width + 
                        v.ty * this.icon.height * (this.width - this.x) / this.width;

                this.offsetX = this.icon.width - this.window.x * this.k;
                this.offsetY = (this.icon.y - this.window.y) * ((this.width - this.x) / this.width) * this.k;

                if (this.EFFECT === 'sine') {
                    this.effectY = Math.sin(this.x / this.width * Math.PI * 4) * this.window.height / 14 * this.k;
                } else {
                    this.effectY = Math.sin((0.5 - (this.width - this.x) / this.width) * 2 * Math.PI) * (this.window.y + this.window.height * v.ty - (this.icon.y + this.icon.height * v.ty)) / 7 * this.k;
                }
            } else if (this.iconPosition == St.Side.TOP) {
                this.height = this.window.height - this.icon.height + this.window.y * this.k;

                this.y = (this.height - this.j * this.height) * v.ty;
                this.x = v.tx * this.window.width * (this.y + (this.height - this.y) * (1 - this.k)) / this.height + 
                        v.tx * this.icon.width * (this.height - this.y) / this.height;

                this.offsetX = (this.icon.x - this.window.x) * ((this.height - this.y) / this.height) * this.k;
                this.offsetY = this.icon.height - this.window.y * this.k;

                if (this.EFFECT === 'sine') {
                    this.effectX = Math.sin(this.y / this.height * Math.PI * 4) * this.window.width / 14 * this.k;
                } else {
                    this.effectX = Math.sin((0.5 - (this.height - this.y) / this.height) * 2 * Math.PI) * (this.window.x + this.window.width * v.tx - (this.icon.x + this.icon.width * v.tx)) / 7 * this.k;
                }
            } else if (this.iconPosition == St.Side.RIGHT) {
                this.expandWidth = (this.iconMonitor.width - this.icon.width - this.window.x - this.window.width);
                this.fullWidth = (this.iconMonitor.width - this.icon.width - this.window.x) - this.expandWidth * (1 - this.k);
                this.width = this.fullWidth - this.j * this.fullWidth;

                this.x = v.tx * this.width;
                this.y = v.ty * (this.icon.height) +
                        v.ty * (this.window.height - this.icon.height) * (1 - this.j) * (1 - v.tx) +
                        v.ty * (this.window.height - this.icon.height) * (1 - this.k) * (v.tx);
                
                this.offsetY = (this.icon.y - this.window.y) * (this.x / this.fullWidth) * this.k + (this.icon.y - this.window.y) * this.j;
                this.offsetX = this.iconMonitor.width - this.icon.width - this.window.x - this.width - this.expandWidth * (1 - this.k);
                
                if (this.EFFECT === 'sine') {
                    this.effectY = Math.sin((this.width - this.x) / this.fullWidth * Math.PI * 4) * this.window.height / 14 * this.k;
                } else {
                    this.effectY = Math.sin(((this.width - this.x) / this.fullWidth) * 2 * Math.PI + Math.PI) * (this.window.y + this.window.height * v.ty - (this.icon.y + this.icon.height * v.ty)) / 7 * this.k;
                }
            } else if (this.iconPosition == St.Side.BOTTOM) {
                this.expandHeight = (this.iconMonitor.height - this.icon.height - this.window.y - this.window.height);
                this.fullHeight = (this.iconMonitor.height - this.icon.height - this.window.y) - this.expandHeight * (1 - this.k);
                this.height = this.fullHeight - this.j * this.fullHeight;
                
                this.y = v.ty * this.height;
                this.x = v.tx * (this.icon.width) +
                        v.tx * (this.window.width - this.icon.width) * (1 - this.j) * (1 - v.ty) +
                        v.tx * (this.window.width - this.icon.width) * (1 - this.k) * (v.ty);

                this.offsetX = (this.icon.x - this.window.x) * (this.y / this.fullHeight) * this.k + (this.icon.x - this.window.x) * this.j;
                this.offsetY = this.iconMonitor.height - this.icon.height - this.window.y - this.height - this.expandHeight * (1 - this.k);

                if (this.EFFECT === 'sine') {
                    this.effectX = Math.sin((this.height - this.y) / this.fullHeight * Math.PI * 4) * this.window.width / 14 * this.k;
                } else {
                    this.effectX = Math.sin(((this.height - this.y) / this.fullHeight) * 2 * Math.PI + Math.PI) * (this.window.x + this.window.width * v.tx - (this.icon.x + this.icon.width * v.tx)) / 7 * this.k;
                }
            }
            
            v.x = (this.x + this.offsetX + this.effectX) * propX;
            v.y = (this.y + this.offsetY + this.effectY) * propY;
        }    
    }
}

export class MagicLampMinimizeEffect extends AbstractCommonMagicLampEffect {
    static {
        GObject.registerClass({GTypeName: 'OpenAppAnimationLampMinimize'}, this);
    }
       
    _init(params = {}) {
        super._init(params);

        this.k = 0;
        this.j = 0;
        this.isMinimizeEffect = true;
    
    }

    on_tick_elapsed(timer, msecs) {
        if (Main.overview.visible) {
            this.destroy();
            return;
        }

        this.progress = timer.get_progress();
        this.k = this.progress <= this.split ? this.progress * (1 / 1 / this.split) : 1;
        this.j = this.progress > this.split ? (this.progress - this.split) * (1 / 1 / (1 - this.split)) : 0;

        this.actor.get_parent().queue_redraw();
        this.invalidate();
    }

    vfunc_modify_paint_volume(pv) {
        return false;
    }
}
    
export class MagicLampUnminimizeEffect extends AbstractCommonMagicLampEffect {
    static {
        GObject.registerClass({GTypeName: 'OpenAppAnimationLampUnminimize'}, this);
    }

    _init(params = {}) {
        super._init(params);

        this.k = 1;
        this.j = 1;
        this.isMinimizeEffect = false;
    }
    

    on_tick_elapsed(timer, msecs) {
        if (Main.overview.visible) {
            this.destroy();
            return;
        }   

        this.progress = timer.get_progress();
        this.k = 1 - (this.progress > (1 - this.split) ? (this.progress - (1 - this.split)) * (1 / 1 / (1 - (1 - this.split))) : 0);
        this.j = 1 - (this.progress <= (1 - this.split) ? this.progress * (1 / 1 / (1 - this.split)) : 1);

        this.actor.get_parent().queue_redraw();
        this.invalidate();
    }

    vfunc_modify_paint_volume(pv) {
        return false;
    }
}