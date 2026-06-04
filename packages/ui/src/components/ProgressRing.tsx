import Svg, { Circle } from 'react-native-svg';
import { Text, View } from 'react-native';

type ProgressRingProps = {
  progress: number;
  size?: number;
  strokeWidth?: number;
  trackColor?: string;
  progressColor?: string;
  label?: string;
  sublabel?: string;
  labelClassName?: string;
  sublabelClassName?: string;
};

export function ProgressRing({
  progress,
  size = 120,
  strokeWidth = 10,
  trackColor = '#0A0A0A',
  progressColor = '#FFFFFF',
  label,
  sublabel,
  labelClassName = 'text-xl font-bold text-accent-foreground',
  sublabelClassName = 'text-xs text-accent-foreground/70',
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(progress, 0), 1);
  const strokeDashoffset = circumference * (1 - clamped);

  return (
    <View className="items-center justify-center" style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={progressColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View className="absolute items-center">
        {label ? <Text className={labelClassName}>{label}</Text> : null}
        {sublabel ? <Text className={sublabelClassName}>{sublabel}</Text> : null}
      </View>
    </View>
  );
}
