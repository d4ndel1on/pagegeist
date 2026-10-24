// Gait lab: live-tunes INTERNAL walk-cycle constants (not part of the public API).
import { type JSX, useState } from 'react';
import { DEFAULT_GAIT, GAIT, type GaitTuning, walkSpeed } from '../src/core/gait';
import { WALK } from '../src/core/render/walk';

/** Gait sliders: [key, min, max, step]. */
const GAIT_SLIDERS: ReadonlyArray<readonly [keyof GaitTuning, number, number, number]> = [
  ['stepLength', 0.2, 0.5, 0.01],
  ['cadence', 1.0, 2.6, 0.05],
  ['stance', 0.5, 0.7, 0.01],
  ['bob', 0, 0.06, 0.005],
];

/** Walk scalars exposed in the lab (WALK has no defaults constant, so snapshot it). */
type WalkTuning = typeof WALK;
type WalkKey = keyof Pick<WalkTuning, 'armSwing' | 'lean' | 'chestComp' | 'headComp'>;
const DEFAULT_WALK: WalkTuning = { ...WALK };

/** Walk sliders: [key, min, max, step]. */
const WALK_SLIDERS: ReadonlyArray<readonly [WalkKey, number, number, number]> = [
  ['armSwing', 0, 1.6, 0.05],
  ['lean', -0.12, 0.15, 0.005],
  ['chestComp', 0, 1, 0.05],
  ['headComp', 0, 1, 0.05],
];

export default function GaitLab({ size }: { size: number }): JSX.Element {
  // The mascot reads GAIT/WALK every frame; React state only mirrors them for display.
  const [gait, setGait] = useState<GaitTuning>(() => ({ ...GAIT }));
  const [walk, setWalk] = useState<WalkTuning>(() => ({ ...WALK }));

  const setGaitValue = (key: keyof GaitTuning, value: number) => {
    GAIT[key] = value;
    setGait({ ...GAIT });
  };
  const setWalkValue = (key: WalkKey, value: number) => {
    WALK[key] = value;
    setWalk({ ...WALK });
  };
  const reset = () => {
    Object.assign(GAIT, DEFAULT_GAIT);
    Object.assign(WALK, DEFAULT_WALK);
    setGait({ ...GAIT });
    setWalk({ ...WALK });
  };

  return (
    <fieldset className="panel__lab">
      <legend>gait lab (internals)</legend>
      {GAIT_SLIDERS.map(([key, min, max, step]) => (
        <Slider key={key} label={key} min={min} max={max} step={step} value={gait[key]} onChange={setGaitValue} />
      ))}
      {WALK_SLIDERS.map(([key, min, max, step]) => (
        <Slider key={key} label={key} min={min} max={max} step={step} value={walk[key]} onChange={setWalkValue} />
      ))}
      <p className="panel__hint">
        {Math.round(walkSpeed(size, gait))} px/s · {Math.round(gait.cadence * 60)} steps/min
      </p>
      <div className="panel__row">
        <button type="button" onClick={reset}>
          Reset gait
        </button>
      </div>
    </fieldset>
  );
}

function Slider<K extends string>(props: {
  label: K;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (key: K, value: number) => void;
}): JSX.Element {
  const { label, min, max, step, value, onChange } = props;
  return (
    <label>
      {label}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(label, Number(e.target.value))}
      />
      <output>{value.toFixed(step < 0.01 ? 3 : 2)}</output>
    </label>
  );
}
