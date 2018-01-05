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
};

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
const get_alien_step_delay = (num_aliens) => {
  // stick with 46 for first 10
  // decrease linearlly from there to 2 (which ends up being like 1/x)
  return num_aliens > 50
    ? 46
    : num_aliens > 45 ? 44 : num_aliens > 40 ? 42 : num_aliens + 1;
};
const LASER_STEP_DELAY = 3;
const BOMB_STEP_DELAY = 5;
const get_bomb_step_delay = (alien_step_delay) =>
  Math.max(alien_step_delay, 20);

const DIR_RIGHT = 1;
const DIR_LEFT = -1;
const DIR_DOWN = 1;
const DIR_UP = -1;

const HIT_TYPE_TOP = 'hit_top';
const HIT_TYPE_ALIEN = 'hit_alien';

// ### Game

class Game {
  constructor() {
    this.state = {};
  }

  init_level(level) {
    // level - int - starts at 1
    let state = this.state;

    state.score = 0;
    state.game_step_count = 0;
    state.alien_step_count = 0;
    state.level = level;
    state.xdir = DIR_RIGHT;
    state.ydir = 0;
    state.defender_dir = 0;
    state.laser = null;
    state.fire_laser = false;
    state.game_over = false;
    state.game_won = false;

    let start_col = parseInt((NUM_COLS - NUM_ALIEN_COLS) / 2);
    let end_col = start_col + NUM_ALIEN_COLS; // exclusive
    let start_row = level - 1;
    let end_row = start_row + NUM_ALIEN_ROWS; // exclusive

    let aliens = [];
    let alien_row = 0;
    for (let row_index = start_row; row_index < end_row; row_index++) {
      for (let col_index = start_col; col_index < end_col; col_index++) {
        aliens.push(
          new Alien(alien_row, col_index * COL_WIDTH, row_index * ROW_HEIGHT)
        );
      }
      alien_row++;
    }
    state.aliens = aliens;
    state.bombs = [];
    state.defender = new Defender();
  }

  set_defender_dir(dir) {
    this.state.defender_dir = dir;
  }

  set_fire_laser() {
    if (this.state.laser === null) {
      this.state.fire_laser = true;
    }
  }

  step(timestamp, start_time) {
    let state = this.state;
    state.game_step_count++;
    state.alien_step_count++;

    let updates = {};

    // create laser
    if (state.fire_laser) {
      state.laser = new Laser(
        state.defender.center_x,
        state.defender.grid_y - 1
      );
      state.fire_laser = false;
      updates.laser_created = true;
    }

    // step laser - and check for collisions
    let hit_alien = false;

    if (state.laser && state.game_step_count % LASER_STEP_DELAY === 0) {
      let laser_exploded = this._step_laser();
      if (laser_exploded) {
        updates.laser_exploded = laser_exploded;
        if (laser_exploded.type === HIT_TYPE_ALIEN) {
          state.score += laser_exploded.alien.cfg.score;
          updates.aliens_hit = true;
        }
      }
    }

    // step bombs - and check for collisions
    if (state.bombs.length && state.game_step_count % BOMB_STEP_DELAY === 0) {
      let bomb_exploded = this._step_bombs();
      if (bomb_exploded) {
        updates.bomb_exploded = bomb_exploded;
      }
    }

    // step defender
    if (state.defender_dir !== 0) {
      state.defender.update(state.defender_dir);
      updates.defender = true;
    }

    // step aliens

    // NOTE: alien delay gets faster when fewer exist, so we need to make sure
    // we adjust the alien_step_count when delay changes to prevent weird jumps
    let num_aliens = state.aliens.filter((x) => !x.dead).length;
    let alien_delay = get_alien_step_delay(num_aliens);
    if (state._last_alien_delay && state._last_alien_delay !== alien_delay) {
      let steps_till_next = state.alien_step_count % state._last_alien_delay;
      state.alien_step_count = steps_till_next;
    }
    state._last_alien_delay = alien_delay;

    if (num_aliens > 0 && state.alien_step_count % alien_delay === 0) {
      this._step_aliens();
      updates.aliens_stepped = true;
    }

    let bomb_delay = get_bomb_step_delay(alien_delay);
    if (num_aliens > 0 && state.game_step_count % bomb_delay === 0) {
      this._step_create_bombs();
    }

    state.game_won = num_aliens === 0;

    return updates;
  }

  _step_create_bombs() {
    let state = this.state;

    // get front row of aliens for each column
    let front_row = [];
    let x_coords = {};

    for (let i = state.aliens.length - 1; i >= 0; i--) {
      let alien = state.aliens[i];
      if (!alien.dead && !x_coords[alien.grid_x]) {
        x_coords[alien.grid_x] = true;
        front_row.push(alien);
      }
    }

    // select one at random
    let alien = front_row[parseInt(Math.random() * front_row.length)];
    if (alien) {
      state.bombs.push(
        new Bomb(alien.center_x, alien.grid_y + alien.box_height, alien.grid_y)
      );
    }
  }

  _step_bombs() {
    let state = this.state;

    let exploded = null; // TODO - this is for just defender hits, animate bottom too

    state.bombs = state.bombs.filter((bomb) => {
      bomb.update(DIR_DOWN);

      let x = bomb.grid_x;
      let y = bomb.grid_y;

      if (y >= GRID_HEIGHT + ROW_HEIGHT) {
        // hit bottom
        return false;
      } else if (state.defender.contains(x, y)) {
        // hit defender
        exploded = bomb;
        return false;
      }

      return true;
    });

    if (exploded) {
      state.game_over = true;
    }

    return exploded;
  }

  _step_laser() {
    let state = this.state;

    state.laser.update(DIR_UP);

    let x = state.laser.grid_x;

    // NOTE: we are checking where y was in the last step, this
    // is because we haven't rendered this step yet and want to
    // see if what was shown in the last step should be a collision!
    //
    // For the same reason, we want to check this before we step
    // any of the aliens too!
    //
    let y = state.laser.grid_y - DIR_UP;

    // check for hit top
    if (y <= 0) {
      state.laser = null;
      return { x, y, type: HIT_TYPE_TOP };
    } else {
      // check for hit aliens
      let hit_alien = state.aliens
        .filter((alien) => !alien.dead && alien.contains(x, y))
        .pop();
      if (hit_alien) {
        hit_alien.dead = true;
        state.laser = null;
        return { x, y, type: HIT_TYPE_ALIEN, alien: hit_alien };
      }
    }

    return false;
  }

  _step_aliens() {
    let state = this.state;

    let hit_wall = false;
    let game_over = false;

    let dx = state.xdir;
    let dy = state.ydir;

    this.state.aliens = this.state.aliens.filter((alien) => !alien.dead);

    state.aliens.forEach((alien) => {
      alien.update(dx, dy);

      let alien_hit_wall =
        state.xdir === DIR_RIGHT
          ? alien.grid_x + COL_WIDTH === GRID_WIDTH
          : alien.grid_x === 0;
      if (alien_hit_wall) {
        hit_wall = true;
      }

      let alien_game_over = alien.grid_y === GRID_HEIGHT - 1;
      if (alien_game_over) {
        game_over = true;
      }
    });

    if (hit_wall) {
      state.xdir = state.xdir === DIR_RIGHT ? DIR_LEFT : DIR_RIGHT;
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

    state.aliens.forEach((alien) => {
      for (let k = alien.grid_x + 1; k < alien.grid_x + COL_WIDTH - 1; k++) {
        grid[alien.grid_y][k] = 'X';
      }
    });

    let viz = grid.map((row) => `|${row.join('')}|`).join('\n');
    console.log(`step: ${state.alien_step_count}\n${viz}`);
  }
}

// ### Grid Element Super Class

class GridElement {
  constructor(grid_x, grid_y, box_x, box_y, box_width, box_height) {
    this.grid_x = grid_x;
    this.grid_y = grid_y;
    this.box_x = box_x;
    this.box_y = box_y;
    this.box_width = box_width;
    this.box_height = box_height;
  }

  update(dx, dy) {
    this.grid_x += dx;
    this.grid_y += dy;
  }

  get center_x() {
    return this.grid_x + this.box_x + this.box_width / 2;
  }

  get center_y() {
    return this.grid_y + this.box_y + this.box_height / 2;
  }

  get bounds() {
    return {
      x: this.grid_x + this.box_x,
      y: this.grid_y + this.box_y,
      width: this.box_width,
      height: this.box_height
    };
  }

  contains(x, y) {
    let bounds = this.bounds;
    return (
      x >= bounds.x &&
      x <= bounds.x + bounds.width &&
      y >= bounds.y &&
      y <= bounds.y + bounds.height
    );
  }
}

// ### Defender

class Defender extends GridElement {
  constructor(grid_x) {
    let box_width = COL_WIDTH;
    super(
      grid_x || parseInt(NUM_COLS / 2) * COL_WIDTH,
      GRID_HEIGHT,
      (COL_WIDTH - box_width) / 2,
      0,
      box_width,
      ROW_HEIGHT / 2
    );
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

// ### Laser - shot by Defender

class Laser extends GridElement {
  constructor(grid_x, grid_y) {
    super(grid_x, grid_y, 0, 0, 0, ROW_HEIGHT / 2);
  }

  update(dy) {
    this.grid_y += dy;
  }
}

// ### Bomb - dropped by Aliens

class Bomb extends GridElement {
  constructor(grid_x, grid_y, parent_y) {
    let height = ROW_HEIGHT / 4;
    super(grid_x, grid_y + height, 0, 0, 0, height);
    this.parent_y = parent_y;
  }

  update(dy) {
    this.grid_y += dy;
  }
}

// ### Alien Types

const ALIEN_0 = Symbol('alien 0');
const ALIEN_1 = Symbol('alien 1');
const ALIEN_2 = Symbol('alien 2');

const ALIEN_TYPES = {
  [ALIEN_0]: {
    narrow_by: 1,
    score: 30
  },
  [ALIEN_1]: {
    narrow_by: 0.5,
    score: 20
  },
  [ALIEN_2]: {
    narrow_by: 0,
    score: 10
  }
};

// ### Alien class

class Alien extends GridElement {
  constructor(alien_row, grid_x, grid_y) {
    let type = alien_row === 0 ? ALIEN_0 : alien_row <= 2 ? ALIEN_1 : ALIEN_2;
    let cfg = ALIEN_TYPES[type];
    let box_width = 5.5 - cfg.narrow_by;

    super(
      grid_x,
      grid_y,
      (COL_WIDTH - box_width) / 2,
      0,
      5.5 - cfg.narrow_by,
      1.1
    );

    this.alien_row = alien_row;
    this.type = type;
    this.cfg = cfg;
    assert(
      this.cfg !== undefined,
      'unabled to find alien type for ${this.type.toString()}'
    );

    this.expression = false;
    this.dead = false;
  }

  update(dx, dy) {
    super.update(dx, dy);
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
  game_over: Symbol('game_over')
};

const EXPLODE_STEPS = 60;

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

    document.addEventListener(
      'keydown',
      this.document_on_keydown.bind(this),
      false
    );

    this.state = UI_STATES.game_over;
    this.level = 1;
    this.paused = false;

    // key events
    const stop_defender = () => this.game.set_defender_dir(0);

    this.key_handlers = [
      {
        code: 13,
        char: 'return',
        info: 'start game',
        on_keydown: () => {
          if (this.state === UI_STATES.game_over) {
            this.start();
          }
        }
      },
      {
        code: 37,
        char: 'arrow left',
        info: 'move defender left',
        on_keydown: () => this.game.set_defender_dir(DIR_LEFT),
        on_keyup: stop_defender
      },
      {
        code: 39,
        char: 'arrow right',
        info: 'move defender right',
        on_keydown: () => this.game.set_defender_dir(DIR_RIGHT),
        on_keyup: stop_defender
      },
      {
        code: 32,
        char: 'spacebar',
        info: 'fire the laser',
        on_keydown: () => {
          if (this.state === UI_STATES.game_over) {
            this.start();
          } else {
            this.game.set_fire_laser();
          }
        }
      },
      {
        code: 189,
        char: '-', // minus
        info: 'volume down',
        on_keydown: () => {
          if (Sound) {
            Sound.volume_down();
          }
        }
      },
      {
        code: 187,
        char: '+', // plus
        info: 'volume up',
        on_keydown: () => {
          if (Sound) {
            Sound.volume_up();
          }
        }
      },
      {
        code: 77,
        char: 'm',
        info: 'mute',
        on_keydown: () => {
          if (Sound) {
            Sound.toggle_mute();
          }
        }
      },
      {
        code: 80,
        char: 'p',
        info: 'pause',
        on_keydown: () => this.toggle_pause()
      },
      {
        code: 83,
        char: 's',
        info: 'step paused game (for debugging)',
        on_keydown: () => {
          // HACK - allow stepping through game when paused
          if (this.paused && this.state !== UI_STATES.game_over) {
            this.loop();
          }
        }
      },
      {
        code: 68,
        char: 'd',
        info: 'show hit boxes (for debugging)',
        on_keydown: () => {
          // HACK - toggle debug mode
          window._DEBUG = !window._DEBUG;
        }
      },
      {
        code: 191,
        char: '?',
        info: 'show keyboard commands',
        on_keydown: () => this.toggle_key_modal(),
        use_document: true
      }
    ];

    // create mapping of key_handlers to apply to events
    this._doc_keydown_map = {};
    this._keydown_map = {};
    this._keyup_map = {};

    this.key_handlers.forEach((kh) => {
      if (kh.use_document) {
        if (kh.on_keydown) {
          this._doc_keydown_map[kh.code] = kh.on_keydown;
        }
      } else {
        if (kh.on_keydown) {
          this._keydown_map[kh.code] = kh.on_keydown;
        }
        if (kh.on_keyup) {
          this._keyup_map[kh.code] = kh.on_keyup;
        }
      }
    });

    // extra handlers
    const _toggle_modal = (e) => {
      e.preventDefault();
      this.toggle_key_modal();
    };

    document.getElementById('help').addEventListener('click', _toggle_modal);
    for (let closeElt of document.getElementsByClassName('close')) {
      closeElt.addEventListener('click', _toggle_modal);
    }
  }

  // event handlers

  on_click(evt) {
    if (this.state === UI_STATES.game_over) {
      this.start();
    }
  }

  on_keydown(evt) {
    return this._on_keyevent(evt, this._keydown_map);
  }

  on_keyup(evt) {
    return this._on_keyevent(evt, this._keyup_map);
  }

  document_on_keydown(evt) {
    return this._on_keyevent(evt, this._doc_keydown_map);
  }

  _on_keyevent(evt, keymap) {
    let fn = keymap[evt.keyCode];
    if (fn) {
      fn();
      evt.preventDefault();
    }
  }

  // game loop

  start() {
    Draw.clear_all();

    this.state = UI_STATES.started;
    this.hit_aliens = [];
    this.paused = false;

    this.game = new Game();
    this.game.init_level(this.level);

    let self = this;
    this.start_time = null;

    this.loop();
  }

  loop() {
    this._animId = window.requestAnimationFrame((timestamp) => {
      let game = this.game;

      if (this.start_time === null) {
        this.start_time = timestamp;
      }

      // game won scenario
      if (game.state.game_won) {
        if (this.hit_aliens.length) {
          this.state = UI_STATES.exploding;
          Draw.clear(CTX_A);
          this._render_hit_aliens();
          this.loop();
        } else {
          this.state = UI_STATES.game_over;
          Draw.centered_text(CTX_A, 'You won!', `Score ${game.state.score}`);
          Sound.play_win();
        }
      } else if (game.state.game_over) {
        // game over scenario
        if (this.state !== UI_STATES.exploding) {
          Sound.play_lose();
        }
        this.state = UI_STATES.exploding;

        let done = this._render_hit_defender(game.state.defender);
        if (done) {
          this.state = UI_STATES.game_over;
          Draw.centered_text(CTX_A, 'Game over!', `Score ${game.state.score}`);
        } else {
          this.loop();
        }
      } else {
        // regular loop scenario
        let updates = game.step(timestamp, this.start_time);

        // sound effects
        if (Sound !== null) {
          if (updates.aliens_stepped) {
            Sound.step_aliens();
          }
          if (updates.laser_created) {
            Sound.play_laser();
          }
          if (updates.aliens_hit) {
            Sound.play_explosion();
          } else if (updates.laser_exploded) {
            Sound.play_dud();
          }
        }

        if (
          updates.laser_exploded &&
          updates.laser_exploded.type === HIT_TYPE_ALIEN
        ) {
          let elt = updates.laser_exploded.alien;
          this.hit_aliens.push({
            elt: elt,
            steps: EXPLODE_STEPS,
            fill: this._grid_y_to_alien_color(elt.grid_y)
          });
        }

        this.render(game.state, this.hit_aliens);

        if (!this.paused) {
          this.loop();
        }
      }
    });
  }

  toggle_pause() {
    this.paused = !this.paused;
    if (!this.paused && this.state !== UI_STATES.game_over) {
      // TODO - feels like jenky UI_STATES usage... maybe drop symbols and
      // have something more config-like, e.g., this.state.is_loopable
      this.loop();
    }
  }

  toggle_key_modal(evt) {
    if (evt && evt.preventDefault) {
      evt.preventDefault();
    }
    let elt = document.getElementById('key-modal');
    this._displaying_modal = !this._displaying_modal;
    if (this._displaying_modal) {
      // show it
      let text = this._key_modal_as_text('');
      elt.getElementsByTagName('p')[0].innerText = text;
      elt.className = 'show';

      if (!this.paused) {
        this.toggle_pause();
      }
    } else {
      // hide it
      elt.className = '';

      if (this.paused) {
        this.toggle_pause();
      }
    }
  }

  _key_modal_as_text(prefix) {
    prefix = prefix === undefined ? '*   ' : prefix;
    return this.key_handlers
      .map((x) => `${prefix}${x.char} = ${x.info}`)
      .join('\n');
  }

  // render methods

  render(game_state) {
    Draw.clear(CTX_A);
    // CTX_A.fillStyle = '#555'; // for debug...
    // CTX_A.fillRect(C_GRID_X_START, C_GRID_Y_START, C_GRID_WIDTH, C_GRID_HEIGHT);
    this._render_defender(game_state.defender);
    this._render_laser(game_state.laser);
    game_state.aliens.forEach((alien) => this._render_alien(alien));
    this._render_bombs(game_state.bombs);
    this._render_hit_aliens();
  }

  _render_hit_aliens(ctx) {
    ctx = ctx || CTX_A;

    this.hit_aliens = this.hit_aliens.filter((hal) => {
      return this._animate_burst(hal, EXPLODE_STEPS, ctx);
    });
  }

  _animate_burst(burst_elt, max_steps, ctx) {
    // burst_elt - {elt<GridElement>, steps<int>, fill<str>}
    // max_steps - int - number of steps to start with
    //
    let elt = burst_elt.elt;
    let fill = burst_elt.fill;

    let max_square = 20;
    let max_distance = 10;

    let { x, y } = this._grid_to_canvas(elt.center_x, elt.center_y);

    let progress = (max_steps - burst_elt.steps) / max_steps;
    progress = this._fade_out_exp(progress);

    if (progress < 0.8) {
      let crossw = 7 * progress;
      ctx.fillStyle = `rgba(255, 255, 255, ${1 - progress})`;
      Draw.circle(ctx, x, y, crossw).fill();
    }

    for (let dx = -1; dx <= 1; dx += 2) {
      for (let dy = -1; dy <= 1; dy += 2) {
        let x_a = x + progress * max_distance * dx;
        let y_a = y + progress * max_distance * dy;
        let width = max_square * (1 - progress);

        ctx.save();
        ctx.fillStyle = fill;
        ctx.translate(x_a, y_a);
        ctx.rotate(Math.PI / 4 * parseInt(progress * 5));
        ctx.fillRect(-width / 2, -width / 2, width, width);
        ctx.restore();
      }
    }

    burst_elt.steps--;
    return burst_elt.steps > 0;
  }

  _render_laser(laser, ctx) {
    if (!laser) {
      return;
    }

    ctx = ctx || CTX_D;

    let { x, y, height } = this._grid_to_canvas(
      laser.grid_x,
      laser.grid_y,
      undefined,
      laser.box_height
    );

    let color = ALIEN_COLORS[laser.grid_y % ALIEN_COLORS.length];

    ctx.strokeStyle = color;
    Draw.shape(ctx, [{ x: x, y: y }, { x: x, y: y + height }]).stroke();

    if (window._DEBUG === true) {
      this._render_debug_dot(x, y, ctx);
    }
  }

  _render_bombs(bombs, ctx) {
    if (!bombs.length) {
      return;
    }

    bombs.forEach((bomb) => {
      let { x, y, height } = this._grid_to_canvas(
        bomb.grid_x,
        bomb.grid_y,
        undefined,
        bomb.box_height
      );

      ctx = ctx || CTX_D;

      // HACK - assign a color
      if (!bomb._fill) {
        bomb._fill = this._grid_y_to_alien_color(bomb.parent_y);
      }

      ctx.strokeStyle = bomb._fill;
      Draw.shape(ctx, [{ x: x, y: y }, { x: x, y: y - height }]).stroke();
      ctx.fillStyle = '#fff';
      Draw.circle(ctx, x, y, 1.5).fill();

      if (window._DEBUG === true) {
        this._render_debug_dot(x, y, ctx);
      }
    });
  }

  _render_hit_defender(defender, ctx) {
    ctx = ctx || CTX_D;
    Draw.clear(ctx);

    let max_steps = 100;
    if (!this._burst_defender || !this._burst_defender.steps) {
      this._burst_defender = { elt: defender, steps: max_steps, fill: '#fff' };
    }
    let going = this._animate_burst(this._burst_defender, max_steps, CTX_D);
    return !going;
  }

  _render_defender(defender, ctx) {
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

    // debug box
    if (window._DEBUG === true) {
      this._render_debug_box(defender, ctx);
    }
  }

  _render_alien(alien, ctx) {
    if (alien.dead) {
      return;
    }

    ctx = ctx || CTX_A;

    let { x, y, width, height } = this._grid_to_canvas(
      alien.grid_x + alien.box_x,
      alien.grid_y + alien.box_y,
      alien.box_width,
      alien.box_height
    );

    // get color and draw trapezoid
    let fill = this._grid_y_to_alien_color(alien.grid_y);

    let sw = { x: x, y: y + height };
    let nw = { x: x + width / 6, y: y };
    let ne = { x: x + width * 5 / 6, y: y };
    let se = { x: x + width, y: y + height };

    ctx.fillStyle = fill;
    Draw.shape(ctx, [sw, nw, ne, se]).fill();

    switch (alien.type) {
      case ALIEN_0:
        ctx.strokeStyle = fill;
        let outside_y = ne.y + (alien.expression ? 3 : 7);
        Draw.shape(ctx, [
          { x: ne.x, y: ne.y + 5 },
          { x: ne.x + 5, y: outside_y }
        ]).stroke();
        Draw.shape(ctx, [
          { x: nw.x, y: nw.y + 5 },
          { x: nw.x - 5, y: outside_y }
        ]).stroke();
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
        Draw.shape(ctx, [
          { x: nw.x, y: nw.y },
          { x: nw.x + 3 - x_adj, y: nw.y - 4 },
          { x: nw.x + 6, y: nw.y }
        ]).fill();
        Draw.shape(ctx, [
          { x: ne.x, y: ne.y },
          { x: ne.x - 3 + x_adj, y: ne.y - 4 },
          { x: ne.x - 6, y: ne.y }
        ]).fill();
        ctx.fillStyle = '#000';
        x_adj *= 0.5;
        Draw.shape(ctx, [
          { x: nw.x + 2, y: nw.y + 1 },
          { x: nw.x + 3 - x_adj, y: nw.y - 2 },
          { x: nw.x + 4, y: nw.y + 1 }
        ]).fill();
        Draw.shape(ctx, [
          { x: ne.x - 2, y: ne.y + 1 },
          { x: ne.x - 3 + x_adj, y: ne.y - 2 },
          { x: ne.x - 4, y: ne.y + 1 }
        ]).fill();
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
      Draw.circle(
        ctx,
        x + width * 3 / 8,
        y + height * 5 / 6,
        3,
        Math.PI,
        2 * Math.PI,
        true
      ).fill();
    }

    // debug box
    if (window._DEBUG === true) {
      this._render_debug_box(alien, ctx);
    }
  }

  _render_debug_box(elt, ctx) {
    let b = elt.bounds;
    b = this._grid_to_canvas(b.x, b.y, b.width, b.height);
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(b.x, b.y, b.width, b.height);
  }

  _render_debug_dot(x, y, ctx) {
    ctx.fillStyle = '#fff';
    Draw.circle(ctx, x, y, 2).fill();
  }

  // helpers

  _fade_out_quad(frac) {
    // frac - float - 0 to 1
    // quadratic fade-out: y = 1 - (x - 1)^2
    return 1 - Math.pow(frac - 1, 2);
  }

  _fade_out_exp(frac) {
    // frac - float - 0 to 1
    // exponential fade-out: y = (2 - 2^(1 - 6x)) / 2
    return (2 - Math.pow(2, 1 - 6 * frac)) / 2;
  }

  _grid_y_to_alien_color(grid_y) {
    let color_steps = GRID_HEIGHT / ALIEN_COLORS.length;
    return ALIEN_COLORS[parseInt(grid_y / color_steps)];
  }

  _grid_to_canvas(x, y, width, height) {
    // converts from the `Game` object's grid coordinates
    // to coordinates on the `UI`'s canvas
    return {
      x: C_GRID_X_START + x * C_WIDTH_FACTOR,
      y: y === undefined ? y : C_GRID_Y_START + y * C_HEIGHT_FACTOR,
      width: width === undefined ? width : width * C_WIDTH_FACTOR,
      height: height === undefined ? height : height * C_HEIGHT_FACTOR
    };
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
    ctx.arc(
      x,
      y,
      radius,
      start === undefined ? 0 : start,
      end === undefined ? 2 * Math.PI : end,
      counterclockwise
    );
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
  centered_text: (ctx, text, sub_text) => {
    let size = 48;
    let x = C_WIDTH / 2;
    let y = C_HEIGHT / 2 - (sub_text ? size / 2 : 0);
    const font = (s) => `normal ${s}px courier new, monospace`;

    ctx.font = font(size);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);

    if (sub_text) {
      ctx.font = font(size * 0.75);
      ctx.fillText(sub_text, x, y + size);
    }
  }
};

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
  let step_freqs = [138.59, 123.47, 110.0, 103.83];
  // step_freqs = [138.59, 164.81, 103.83, 123.47];

  let self = {
    set_volume: (percent) => {
      volume_percent = percent;
    },
    volume_up: () => {
      volume_percent = Math.min(volume_percent + 10, 100);
      if (mute) {
        mute = false;
      }
    },
    volume_down: () => {
      volume_percent = Math.max(volume_percent - 10, 0);
    },
    toggle_mute: () => {
      mute = !mute;
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
    },

    // #### Sound effects
    //

    step_aliens: () => {
      let freq = step_freqs[step_counter];
      step_counter = (step_counter + 1) % step_freqs.length;

      self.play_note(freq, { type: 'triangle' });
    },
    play_laser: () => {
      Sound.play_note(659.25, {
        duration: 0.15,
        type: 'triangle',
        vol_adjust: 0.5
      });
    },
    play_explosion: () => {
      Sound.play_note(69.3, {
        duration: 0.15,
        type: 'sawtooth',
        vol_adjust: 0.6
      });
      setTimeout(
        () =>
          Sound.play_note(98, {
            duration: 0.175,
            type: 'sawtooth',
            vol_adjust: 0.6
          }),
        100
      );
    },
    play_dud: () => {
      Sound.play_note(69.3, {
        duration: 0.15,
        type: 'sawtooth',
        vol_adjust: 0.6
      });
      // setTimeout(() => Sound.play_note(98, {duration: .175, type: 'sawtooth', vol_adjust: .6}), 100);
    },
    play_lose: () => {
      Sound.play_note(98, { duration: 0.3, type: 'sawtooth', vol_adjust: 0.4 });
      setTimeout(
        () =>
          Sound.play_note(69.3, {
            duration: 0.3,
            type: 'sawtooth',
            vol_adjust: 0.7
          }),
        200
      );
      setTimeout(
        () =>
          Sound.play_note(49.0, {
            duration: 0.5,
            type: 'sawtooth',
            vol_adjust: 0.9
          }),
        400
      );
    },
    play_win: () => {
      // c# 3 - 138.59
      // g# 3 - 207.65
      let csharp = [138.59, { duration: 0.2, type: 'sawtooth', vol_adjust: 1 }];

      Sound.play_note.apply(Sound, csharp);
      setTimeout(() => Sound.play_note.apply(Sound, csharp), 300);
      setTimeout(
        () =>
          Sound.play_note(207.65, {
            duration: 0.6,
            type: 'sawtooth',
            vol_adjust: 1
          }),
        425
      );
    }
  };

  return self;
})();
