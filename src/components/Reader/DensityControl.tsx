import styles from './DensityControl.module.css';

interface Props {
  density: number;
  onChange: (value: number) => void;
}

export function DensityControl({ density, onChange }: Props) {
  return (
    <div className={styles.bar}>
      <label className={styles.label} htmlFor="density-slider">
        Polish density
      </label>
      <input
        id="density-slider"
        className={styles.slider}
        type="range"
        min={5}
        max={50}
        step={5}
        value={density}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className={styles.value}>{density}%</span>
    </div>
  );
}
