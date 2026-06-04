import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, Platform, type KeyboardEvent } from 'react-native';

function keyboardBottomInset(event: KeyboardEvent): number {
  if (Platform.OS === 'android') {
    const windowHeight = Dimensions.get('window').height;
    // adjustResize 生效时 screenY ≈ windowHeight，inset ≈ 0；键盘 overlay 时 inset = 键盘高度
    return Math.max(0, windowHeight - event.endCoordinates.screenY);
  }
  return event.endCoordinates.height;
}

/**
 * 输入栏应抬离屏幕底部的距离（px）。键盘收起时为 0。
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const onShow = (event: KeyboardEvent) => {
      setHeight(keyboardBottomInset(event));
    };
    const onHide = () => setHeight(0);

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}
