'use strict';

// Space Creatures
// ===============
//
// Involves:
//
// *   Needs a game screen
// *   alien creatures (3 different types)
// *   a defender
// *   TODO: bunkers + ufo once in a while?
//
// Notes:
//
// *   Aliens in an 11 x 5 formation
//
// *   Alien movement
//     *   aliens take up 1 "column" of space horizontally
//     *   each step an alien takes is 1/8 of a column alternating
//         between splayed and contracted view
//     *   all aliens move in the same direction and the same speed
//     *   aliens start centered at the top of the grid (and in later
//         levels they start lower)
//     *   there are 13 columns in the grid
//     *   aliens take up 1 "row" of space vertically
//     *   when an alien reachs the outside column of a row they all
//         jump down 1/2 of a row and move horizontally in the opposite
//         direction
//     *   there 10 rows in the grid
//
// *   Scoring
//     *   Alien creatures: 10 (bottom two rows), 20 (middle and second from top rows),
//         or 30 points (top row).
//     *   Mystery ship: 50, 100, 150, or 300 points.
//
// *   Lives
//     *   Player starts with 3 lifes total
//     *   Player earns an extra life at 1000 points
//
// *   Shooting
//     *   enemies die with 1 hit and have a simple explosion sprite
//     *   only one defender bullet can be in flight at a time
//     *   enemies shoot faster and move faster when fewer remain
//     *   bunkers take damage from both sides
//     *   enemies try to shoot nearest to defender if possible?
//
// *   Game state
//     *   current level
//     *   board size
//     *   current aliens and their state
//     *   current buners and their state
//     *   defender and its location


const assert = (cond, msg) => {
  if (!cond) {
    throw new Error(msg || 'assertion error ${cond}');
  }
}


// Game Backend
// ------------
//
// This is the state and functionality (but no UI) for the game
//

// ### Constants

// Column and row constants - these help a human visualize where aliens are

const NUM_COLS = 13;
const NUM_ROWS = 10;


// Grid constants - this is the larger grid that columns and rows sit on top of

const COL_WIDTH = 8;
const ROW_HEIGHT = 2;

const GRID_WIDTH = COL_WIDTH * NUM_COLS;
const GRID_HEIGHT = ROW_HEIGHT * NUM_ROWS;


// Alien constants

const NUM_ALIEN_COLS = 11;
const NUM_ALIEN_ROWS = 5;

// this determines how often they move move when the game steps
const ALIEN_STEP_DELAY = 30;

const DIR_RIGHT = 1;
const DIR_LEFT = -1;
const DIR_DOWN = 1;


// ### Game

class Game {
  constructor() {
    this.state = {};
  }

  init_level(level) {
    // level - int - starts at 1
    let state = this.state;

    state.step_count = 0;
    state.level = level;
    state.xdir = DIR_RIGHT;
    state.ydir = 0;
    state.defender_dir = 0;
    state.game_over = false;

    let start_col = parseInt((NUM_COLS - NUM_ALIEN_COLS) / 2);
    let end_col = start_col + NUM_ALIEN_COLS; // exclusive
    let start_row = level - 1;
    let end_row = start_row + NUM_ALIEN_ROWS; // exclusive

    let aliens = [];
    let alien_row = 0;
    for (let row_index = start_row; row_index < end_row; row_index++) {
      for (let col_index = start_col; col_index < end_col; col_index++) {
        aliens.push(new Alien(alien_row, col_index * COL_WIDTH, row_index * ROW_HEIGHT));
      }
      alien_row++;
    }
    state.aliens = aliens;

    state.defender = new Defender();
  }

  set_defender_dir(dir) {
    this.state.defender_dir = dir;
  }

  step(timestamp, start_time) {
    let state = this.state;
    state.step_count++;

    let updates = {};

    if (state.defender_dir !== 0) {
      state.defender.update(state.defender_dir);
      updates.defender = true;
    }

    if (state.step_count % ALIEN_STEP_DELAY === 0) {
      this._step_aliens();
      updates.aliens = true;
    }

    return updates;
  }

  _step_aliens() {
    let state = this.state;

    let hit_wall = false;
    let game_over = false;

    let dx = state.xdir;
    let dy = state.ydir;

    this.state.aliens = this.state.aliens.filter(alien => !alien.dead);

    state.aliens.forEach(alien => {
      alien.update(dx, dy);

      let alien_hit_wall = (state.xdir === DIR_RIGHT ?
                            alien.grid_x + COL_WIDTH === GRID_WIDTH :
                            alien.grid_x === 0);
      if (alien_hit_wall) {
        hit_wall = true;
      }

      let alien_game_over = alien.grid_y === GRID_HEIGHT - 1;
      if (alien_game_over) {
        game_over = true;
      }
    });

    if (hit_wall) {
      state.xdir = (state.xdir === DIR_RIGHT ? DIR_LEFT : DIR_RIGHT);
      state.ydir = DIR_DOWN;
    } else {
      state.ydir = 0;
    }

    state.game_over = game_over;
  }

  _debug_render() {
    let grid = [];
    for (let i = 0; i < GRID_HEIGHT; i++) {
      let row = [];
      for (let j = 0; j < GRID_WIDTH; j++) {
        row.push(' ');
      }
      grid.push(row);
    }

    let state = this.state;

    state.aliens.forEach(alien => {
      for (let k = alien.grid_x + 1; k < alien.grid_x + COL_WIDTH - 1; k++) {
        grid[alien.grid_y][k] = 'X';
      }
    });

    let viz = grid.map(row => `|${row.join('')}|`).join('\n');
    console.log(`step: ${state.step_count}\n${viz}`);
  }
}


// ### Defender

class Defender {
  constructor(grid_x) {
    this.grid_x = grid_x || parseInt(NUM_COLS / 2) * COL_WIDTH;
    this.grid_y = GRID_HEIGHT;
    this.box_width = COL_WIDTH;
    this.box_height = ROW_HEIGHT / 2;
    this.box_x = (COL_WIDTH - this.box_width) / 2;
    this.box_y = 0;
  }

  update(dx) {
    let new_x = this.grid_x + dx;
    if (new_x < 0) {
      new_x = 0;
    } else if (new_x + COL_WIDTH > GRID_WIDTH) {
      new_x = GRID_WIDTH - COL_WIDTH;
    }
    this.grid_x = new_x;
  }
}


// ### Alien Types

const ALIEN_0 = Symbol('alien 0');
const ALIEN_1 = Symbol('alien 1');
const ALIEN_2 = Symbol('alien 2');

const ALIEN_TYPES = {
  [ALIEN_0]: {
    narrow_by: 1
  },
  [ALIEN_1]: {
    narrow_by: .5
  },
  [ALIEN_2]: {
    narrow_by: 0
  }
}


// ### Alien class

class Alien {
  constructor(alien_row, grid_x, grid_y) {
    this.alien_row = alien_row;
    this.grid_x = grid_x;
    this.grid_y = grid_y;

    this.type = (alien_row === 0 ? ALIEN_0 :
                 alien_row <= 2 ? ALIEN_1 : ALIEN_2);
    this.cfg = ALIEN_TYPES[this.type];
    assert(this.cfg !== undefined, 'unabled to find alien type for ${this.type.toString()}');

    this.box_width = 5.5 - this.cfg.narrow_by;
    this.box_height = 1.1;
    this.box_x = (COL_WIDTH - this.box_width) / 2;
    this.box_y = 0;

    this.expression = false;
    this.dead = false;
  }

  update(dx, dy) {
    this.grid_x += dx;
    this.grid_y += dy;
    this.expression = !this.expression;
  }
}


// UI
// --
//
// The code to render the game and handle user controls.
// Using a couple canvas objects as layers.
//

// ### UI Constants

const PARENT = document.getElementById('game');
const CANVAS_A = document.getElementById('game-aliens');
const CANVAS_D = document.getElementById('game-defender');

const CTX_A = CANVAS_A.getContext('2d');
const CTX_D = CANVAS_D.getContext('2d');

const CTXS = [CTX_A, CTX_D];

const C_WIDTH = 800;
const C_HEIGHT = 600;

[PARENT, CANVAS_A, CANVAS_D].forEach((c) => {
  c.style.width = `${C_WIDTH}px`;
  c.style.height = `${C_HEIGHT}px`;
  c.width = C_WIDTH;
  c.height = C_HEIGHT;
});

// multiplier of the game's internal grid width to canvas pixels
const C_WIDTH_FACTOR = 5;

// multiplier of the game's internal grid height to the canvas pixels
const C_HEIGHT_FACTOR = 25;

const C_COL_WIDTH = COL_WIDTH * C_WIDTH_FACTOR;
const C_ROW_HEIGHT = ROW_HEIGHT * C_HEIGHT_FACTOR;

const C_GRID_WIDTH = GRID_WIDTH * C_WIDTH_FACTOR;
const C_GRID_HEIGHT = GRID_HEIGHT * C_HEIGHT_FACTOR;

assert(C_GRID_WIDTH < C_WIDTH);
assert(C_GRID_HEIGHT < C_HEIGHT);

const C_GRID_X_START = parseInt((C_WIDTH - C_GRID_WIDTH) / 2);
const C_GRID_X_END = C_GRID_X_START + C_GRID_WIDTH;

const C_GRID_Y_START = parseInt((C_HEIGHT - C_GRID_HEIGHT) / 2);
const C_GRID_Y_END = C_GRID_Y_START + C_GRID_HEIGHT;

const ALIEN_COLORS = ['#0f0', '#0ff', '#f0f', '#ff0', '#f00'];

const UI_STATES = {
  started: Symbol('started'),
  exploding: Symbol('exploding'),
  gameover: Symbol('gameover')
};


// ### UI Class
//
// Controls clock timing, rendering of game elements, and responding
// to controls.
//

class UI {
  constructor() {
    Draw.centered_text(CTX_A, 'Click to start');

    // NOTE: cheeky code to access and set all on_FOO event handlers.
    // All on_FOO methods should have a FOO that matches a valid event name,
    // e.g., on_click or on_keydown
    for (let method of Object.getOwnPropertyNames(UI.prototype)) {
      if (/^on_/.test(method)) {
        let evt_name = method.substring(3);
        PARENT.addEventListener(evt_name, this[method].bind(this), false);
      }
    }

    this.state = UI_STATES.gameover;
    this.level = 1;
  }

  // event handlers

  on_click(evt) {
    if (this.state === UI_STATES.gameover) {
      this.start();
    }
  }

  on_keydown(evt) {
    let matched = true;

    switch (evt.keyCode) {
      case 13: // return / enter
        if (this.state === UI_STATES.gameover) {
          this.start();
        }
        break;
      case 37: // arrow left
        this.game.set_defender_dir(DIR_LEFT);
        break;
      case 39: // arrow right;
        this.game.set_defender_dir(DIR_RIGHT);
        break;
      case 189: // minus
        if (Sound) {
          Sound.volume_down();
        }
        break;
      case 187: // plus
        if (Sound) {
          Sound.volume_up();
        }
        break;
      case 77: // m
        if (Sound) {
          Sound.toggle_mute();
        }
        break;
      case 32: // spacebar
        // TODO: fill in shooting logic
        console.log('*pew* *pew*');
        break;
      default:
        matched = false;
        break;
    }

    if (matched) {
      evt.preventDefault();
    }
  }

  on_keyup(evt) {
    let matched = true;

    switch (evt.keyCode) {
      case 37: // arrow left - NOTE: this will pass through to next one
      case 39: // arrow right
        this.game.set_defender_dir(0);
        break;
      default:
        matched = false;
        break;
    }

    if (matched) {
      evt.preventDefault();
    }
  }

  // game loop

  start() {
    Draw.clear_all();
    this.state = UI_STATES.started;
    let game = new Game();
    game.init_level(this.level);

    this.game = game;

    let self = this;
    let start_time = null;

    (function loop() {
      self._animId = window.requestAnimationFrame((timestamp) => {
        if (start_time === null) {
          start_time = timestamp;
        }

        if (game.state.game_over) {
          self.state = UI_STATES.exploding;
          let done = self.render_no_defender(game.state.defender);
          if (done) {
            Draw.centered_text(CTX_A, 'Game over!');
            self.state = UI_STATES.gameover;
          } else {
            loop();
          }
        } else {
          let updates = game.step(timestamp, start_time);
          if (Sound !== null && updates.aliens) {
            Sound.step();
          }
          self.render(game.state);
          loop();
        }
      });
    })();
  }

  // render methods

  render(state) {
    Draw.clear(CTX_A);
    // CTX_A.fillStyle = '#555';
    // CTX_A.fillRect(C_GRID_X_START, C_GRID_Y_START, C_GRID_WIDTH, C_GRID_HEIGHT);
    this.render_defender(state.defender);
    state.aliens.forEach((alien) => this.render_alien(alien));
  }

  render_no_defender(defender, ctx) {
    ctx = ctx || CTX_D;
    Draw.clear(ctx);

    const max_counter = 60 * 2;

    if (!this._defender_counter) {
      this._defender_counter = max_counter;
    }

    let { x, y, width, height } = this._grid_to_canvas(
      defender.grid_x + defender.box_x,
      defender.grid_y + defender.box_y,
      defender.box_width,
      defender.box_height
    );

    let mid = {x: x + width / 2, y: y + height / 2};
    let path = [];

    const rand_color = () => ALIEN_COLORS[parseInt(Math.random() * ALIEN_COLORS.length)];
    const rand = () => parseInt(Math.random() * 30) - 15;

    for (let i = 0; i < 10; i++) {
      ctx.strokeStyle = rand_color();
      Draw.shape(ctx, [mid, {x: mid.x + rand(), y: mid.y + rand()}]).stroke();
    }

    this._defender_counter--;

    let complete = (max_counter - this._defender_counter) / max_counter;
    let comp_w = 40 * complete;

    ctx.clearRect(mid.x - comp_w / 2, mid.y - comp_w / 2, comp_w, comp_w);

    return this._defender_counter <= 0;
  }

  render_defender(defender, ctx) {
    ctx = ctx || CTX_D;

    let { x, y, width, height } = this._grid_to_canvas(
      defender.grid_x + defender.box_x,
      defender.grid_y + defender.box_y,
      defender.box_width,
      defender.box_height
    );

    Draw.clear(ctx);

    ctx.fillStyle = '#fff';

    // NOTE - would be easier if I just used sprites!!
    //
    // shape is
    //
    // 1. bottom left corner
    // 2. go up 50%
    // 3. round out 1/6
    // 4. go in 3/8
    // 5. go up 1/6
    // 6. go up to peak over 1/8, up 1/6
    // 7. mirror on other side

    let arc_height = height / 6;
    let cur_y = y + height;
    let cur_x = x;
    let bot_clip = height / 6;

    // 1
    ctx.beginPath();
    ctx.moveTo(x, cur_y - bot_clip);

    // 2
    cur_y -= height / 2;
    ctx.lineTo(x, cur_y);

    // 3
    cur_y -= arc_height;
    ctx.arcTo(x, cur_y, x + arc_height, cur_y, arc_height);

    // 4
    cur_x += width * 3 / 8;
    ctx.lineTo(cur_x, cur_y);

    // 5
    cur_y -= height / 6;
    ctx.lineTo(cur_x, cur_y);

    // 6
    cur_x += width / 8;
    cur_y -= height / 6;
    ctx.lineTo(cur_x, cur_y);

    // 7
    cur_x += width / 8;
    cur_y += height / 6;
    ctx.lineTo(cur_x, cur_y);

    cur_y += height / 6;
    ctx.lineTo(cur_x, cur_y);

    cur_x += width * 3 / 8 - arc_height;
    ctx.lineTo(cur_x, cur_y);

    cur_x = x + width;
    ctx.arcTo(cur_x, cur_y, cur_x, cur_y + arc_height, arc_height);

    cur_y = y + height;
    ctx.lineTo(cur_x, cur_y - bot_clip);

    ctx.closePath();

    ctx.fill();
  }

  render_alien(alien, ctx) {
    ctx = ctx || CTX_A;

    let { x, y, width, height } = this._grid_to_canvas(
      alien.grid_x + alien.box_x,
      alien.grid_y + alien.box_y,
      alien.box_width,
      alien.box_height
    );

    // get color and draw trapezoid
    let color_steps = GRID_HEIGHT / ALIEN_COLORS.length;
    let fill = ALIEN_COLORS[parseInt(alien.grid_y / color_steps)];

    let sw = {x: x, y: y + height};
    let nw = {x: x + width / 6, y: y};
    let ne = {x: x + width * 5 / 6, y: y};
    let se = {x: x + width, y: y + height};

    ctx.fillStyle = fill;
    Draw.shape(ctx, [sw, nw, ne, se]).fill();

    switch (alien.type) {
      case ALIEN_0:
        ctx.strokeStyle = fill;
        let outside_y = ne.y + (alien.expression ? 3 : 7);
        Draw.shape(ctx, [{x: ne.x, y: ne.y + 5},
                         {x: ne.x + 5, y: outside_y}]).stroke();
        Draw.shape(ctx, [{x: nw.x, y: nw.y + 5},
                         {x: nw.x - 5, y: outside_y}]).stroke();
        break;
      case ALIEN_1:
        let y_adj = alien.expression ? 1 : 0;
        Draw.circle(ctx, ne.x, ne.y + 2 + y_adj, 3).fill();
        Draw.circle(ctx, nw.x, nw.y + 2 - y_adj, 3).fill();
        ctx.fillStyle = '#000';
        Draw.circle(ctx, ne.x, ne.y + 2 + y_adj, 1).fill();
        Draw.circle(ctx, nw.x, nw.y + 2 - y_adj, 1).fill();
        break;
      case ALIEN_2:
        let x_adj = alien.expression ? 2 : 0;
        Draw.shape(ctx, [{x: nw.x, y: nw.y},
                         {x: nw.x + 3 - x_adj, y: nw.y - 4},
                         {x: nw.x + 6, y: nw.y}]).fill();
        Draw.shape(ctx, [{x: ne.x, y: ne.y},
                         {x: ne.x - 3 + x_adj, y: ne.y - 4},
                         {x: ne.x - 6, y: ne.y}]).fill();
        ctx.fillStyle = '#000';
        x_adj *= .5;
        Draw.shape(ctx, [{x: nw.x + 2, y: nw.y + 1},
                         {x: nw.x + 3 - x_adj, y: nw.y - 2},
                         {x: nw.x + 4, y: nw.y + 1}]).fill();
        Draw.shape(ctx, [{x: ne.x - 2, y: ne.y + 1},
                         {x: ne.x - 3 + x_adj, y: ne.y - 2},
                         {x: ne.x - 4, y: ne.y + 1}]).fill();
        break;
    }

    // draw face
    let cur_x = x;
    let cur_y = y + height;

    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#000';

    // the mouth
    cur_x += width / 6;
    cur_y -= height / 6;
    ctx.beginPath();
    ctx.moveTo(cur_x, cur_y);

    cur_x += width * 4 / 6;
    ctx.lineTo(cur_x, cur_y);

    ctx.closePath();
    ctx.stroke();

    // the eyes
    Draw.circle(ctx, x + width * 2 / 6, y + height * 4 / 6, 1).fill();
    Draw.circle(ctx, x + width - width * 2 / 6, y + height * 4 / 6, 1).fill();
    
    if (alien.expression) {
      // the mouth
      Draw.circle(ctx,
                  x + width * 3 / 8,
                  y + height * 5 / 6,
                  3, Math.PI, 2 * Math.PI, true).fill();
    }
  }

  // helpers

  _grid_to_canvas(x, y, width, height) {
    // converts from the `Game` object's grid coordinates
    // to coordinates on the `UI`'s canvas
    return {
      x: C_GRID_X_START + x * C_WIDTH_FACTOR,
      y: y === undefined ? y : C_GRID_Y_START + y * C_HEIGHT_FACTOR,
      width: width === undefined ? width : width * C_WIDTH_FACTOR,
      height: height === undefined ? height : height * C_HEIGHT_FACTOR
    }
  }
}


// ### Draw
//
// Helper functions for common canvas operations
//

const Draw = {
  clear: (ctx) => {
    ctx.clearRect(0, 0, C_WIDTH, C_HEIGHT);
  },
  clear_all: () => {
    CTXS.forEach(Draw.clear);
  },
  circle: (ctx, x, y, radius, start, end, counterclockwise) => {
    ctx.beginPath();
    ctx.arc(x, y, radius,
            start === undefined ? 0 : start,
            end === undefined ? 2 * Math.PI : end,
            counterclockwise);
    ctx.closePath();
    return ctx;
  },
  shape: (ctx, pts) => {
    ctx.beginPath();
    pts.forEach((pt, i) => {
      if (i === 0) {
        ctx.moveTo(pt.x, pt.y);
      } else {
        ctx.lineTo(pt.x, pt.y);
      }
    });
    ctx.closePath();
    return ctx;
  },
  centered_text: (ctx, text) => {
    ctx.font = 'normal 48px courier new, monospace';
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, C_WIDTH / 2, C_HEIGHT / 2);
  }
}


// ### Sound
//
// Completely experimental down here...
//

const Sound = (function() {
  var AudioContext = window.AudioContext || window.webkitAudioContext;

  if (!AudioContext) {
    return null;
  }

  var audio_ctx = new AudioContext();

  let volume_percent = 30;
  let mute = false;

  let step_counter = 0;
  let step_freqs = [138.59, 123.47, 110.00, 103.83];
  // step_freqs = [138.59, 164.81, 103.83, 123.47];

  let self = {
    set_volume: (percent) => {
      volume_percent = percent;
    },
    volume_up: () => {
      volume_percent = Math.min(volume_percent + 10, 100);
    },
    volume_down: () => {
      volume_percent = Math.max(volume_percent - 10, 0);
    },
    toggle_mute: () => {
      mute = !mute;
    },
    step: () => {
      let freq = step_freqs[step_counter];
      step_counter = (step_counter + 1) % step_freqs.length;

      self.play_note(freq, {type: 'triangle'});
    },
    play_note: (freq, cfg) => {
      cfg = cfg || {};
      var oscillator = audio_ctx.createOscillator();
      oscillator.type = cfg.type || 'sine';
      oscillator.frequency.value = freq;

      var gain_node = audio_ctx.createGain();
      // gain_node.gain.setValueAtTime(0.01, audio_ctx.currentTime);
      let vol = mute ? 0 : volume_percent / 100;
      if (cfg.vol_adjust) {
        vol *= cfg.vol_adjust;
      }
      gain_node.gain.value = vol;

      oscillator.connect(gain_node);
      gain_node.connect(audio_ctx.destination);

      let duration = cfg.duration || 0.2;
      let current_time = audio_ctx.currentTime;

      oscillator.start(0);
      gain_node.gain.setTargetAtTime(0, current_time + duration - 0.1, 0.015);
      oscillator.stop(current_time + duration);
    }
  };

  return self;

})();

// E4 329.63
// E5 659.25
// Sound.play_note(659.25, {duration: .15, type: 'triangle', vol_adjust: .08})
// Sound.play_note(69.30, {duration: .2, type: 'sawtooth', vol_adjust: 1}); setTimeout(() => Sound.play_note(98, {duration: .2, type: 'sawtooth', vol_adjust: 1}), 100)
// Sound.play_note(98, {duration: .3, type: 'sawtooth', vol_adjust: .4}); setTimeout(() => Sound.play_note(69.30, {duration: .3, type: 'sawtooth', vol_adjust: .7}), 200); setTimeout(() => Sound.play_note(49.00, {duration: .5, type: 'sawtooth', vol_adjust: .9}), 400);

