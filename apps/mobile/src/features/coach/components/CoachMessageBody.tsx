import React, { memo, useEffect, useMemo, useRef } from 'react';
import { Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import type { RenderRules } from 'react-native-markdown-display';

type CoachMessageBodyProps = {
  content: string;
  isUser: boolean;
  onLayout?: () => void;
  /** Fired after layout settles — used when stream ends and markdown finalizes. */
  onLayoutStable?: () => void;
};

const LAYOUT_STABLE_DELAY_MS = 120;

/** 两列表格：左列标签，右列说明 */
const TABLE_FIRST_COL_FLEX = 0.28;

const markdownStyles = {
  body: { color: '#FFFFFF', fontSize: 15, lineHeight: 22 },
  heading1: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700' as const,
    marginTop: 8,
    marginBottom: 4,
  },
  heading2: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600' as const,
    marginTop: 6,
    marginBottom: 4,
  },
  heading3: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600' as const,
    marginTop: 4,
    marginBottom: 4,
  },
  paragraph: { marginTop: 0, marginBottom: 8 },
  bullet_list: { marginBottom: 8 },
  ordered_list: { marginBottom: 8 },
  list_item: { marginBottom: 4 },
  strong: { fontWeight: '700' as const, color: '#FFFFFF' },
  em: { fontStyle: 'italic' as const },
  link: { color: '#D0FD3E' },
  code_inline: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#D0FD3E',
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  fence: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    padding: 8,
    marginVertical: 8,
  },
  code_block: { color: '#FAFAFA', fontFamily: 'monospace' },
  /** 与正文同宽，仅顶线 + 行间分隔，不做独立卡片 */
  table: {
    width: '100%',
    marginTop: 6,
    marginBottom: 8,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  thead: {},
  tbody: { width: '100%' },
  tr: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    width: '100%',
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  th: {
    paddingVertical: 7,
    paddingRight: 10,
    color: '#FFFFFF',
    fontWeight: '600' as const,
    fontSize: 15,
    lineHeight: 22,
  },
  td: {
    paddingVertical: 7,
    paddingLeft: 10,
    color: '#FAFAFA',
    fontSize: 15,
    lineHeight: 22,
  },
};

function buildTableRules(): RenderRules {
  return {
    table: (node, children, _parent, styles) => (
      <View key={node.key} style={styles.table}>
        {children}
      </View>
    ),
    tr: (node, children, _parent, styles) => {
      const cols = React.Children.toArray(children);
      return (
        <View key={node.key} style={styles.tr}>
          {cols.map((child, index) => (
            <View
              key={`${node.key}-col-${index}`}
              style={{
                flex: index === 0 ? TABLE_FIRST_COL_FLEX : 1 - TABLE_FIRST_COL_FLEX,
                minWidth: 0,
                borderLeftWidth: index === 1 ? 1 : 0,
                borderLeftColor: 'rgba(255,255,255,0.1)',
              }}
            >
              {child}
            </View>
          ))}
        </View>
      );
    },
    th: (node, children, _parent, styles) => (
      <View key={node.key} style={styles.th}>
        {children}
      </View>
    ),
    td: (node, children, _parent, styles) => (
      <View key={node.key} style={styles.td}>
        {children}
      </View>
    ),
  };
}

function CoachMessageBodyComponent({
  content,
  isUser,
  onLayout,
  onLayoutStable,
}: CoachMessageBodyProps) {
  const rules = useMemo(() => buildTableRules(), []);
  const stableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
    };
  }, []);

  const handleLayout = () => {
    onLayout?.();
    if (!onLayoutStable) return;
    if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
    stableTimerRef.current = setTimeout(() => {
      stableTimerRef.current = null;
      onLayoutStable();
    }, LAYOUT_STABLE_DELAY_MS);
  };

  if (isUser || !content.trim()) {
    return (
      <Text
        className={isUser ? 'text-accent-foreground' : 'text-foreground'}
        onLayout={onLayout ? handleLayout : undefined}
      >
        {content}
      </Text>
    );
  }

  return (
    <View style={{ alignSelf: 'stretch', width: '100%' }} onLayout={handleLayout}>
      <Markdown style={markdownStyles} rules={rules}>
        {content}
      </Markdown>
    </View>
  );
}

export const CoachMessageBody = memo(CoachMessageBodyComponent);
