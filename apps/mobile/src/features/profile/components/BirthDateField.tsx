import { View } from 'react-native';

import { Input, Label } from '@fitness/ui';

type BirthDateFieldProps = {
  year: string;
  month: string;
  day: string;
  onChangeYear: (v: string) => void;
  onChangeMonth: (v: string) => void;
  onChangeDay: (v: string) => void;
};

export function birthDateToIso(year: string, month: string, day: string): string | null {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!y || !m || !d) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date.toISOString();
}

export function isoToBirthParts(iso: string | Date | undefined): {
  year: string;
  month: string;
  day: string;
} {
  if (!iso) return { year: '', month: '', day: '' };
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return {
    year: String(d.getUTCFullYear()),
    month: String(d.getUTCMonth() + 1),
    day: String(d.getUTCDate()),
  };
}

export function BirthDateField({
  year,
  month,
  day,
  onChangeYear,
  onChangeMonth,
  onChangeDay,
}: BirthDateFieldProps) {
  return (
    <View>
      <Label>出生日期</Label>
      <View className="mt-1 flex-row gap-2">
        <Input
          className="flex-[2]"
          value={year}
          onChangeText={onChangeYear}
          keyboardType="number-pad"
          placeholder="年"
          maxLength={4}
        />
        <Input
          className="flex-1"
          value={month}
          onChangeText={onChangeMonth}
          keyboardType="number-pad"
          placeholder="月"
          maxLength={2}
        />
        <Input
          className="flex-1"
          value={day}
          onChangeText={onChangeDay}
          keyboardType="number-pad"
          placeholder="日"
          maxLength={2}
        />
      </View>
    </View>
  );
}
