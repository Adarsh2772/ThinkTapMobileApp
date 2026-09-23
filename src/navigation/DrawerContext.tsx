import { useRouter } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useWindowDimensions } from "react-native";
import {
  Easing,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

const DRAWER_WIDTH_RATIO = 0.78;
const SPRING = { damping: 22, stiffness: 220, mass: 0.9 };
const CLOSE_MS = 280;

type DrawerContextValue = {
  open: boolean;
  progress: SharedValue<number>;
  drawerWidth: number;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  /** Close with slide animation, then navigate — use for drawer menu items */
  navigateFromDrawer: (href: string) => void;
};

const DrawerContext = createContext<DrawerContextValue | null>(null);

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const progress = useSharedValue(0);
  const { width: screenW } = useWindowDimensions();
  const drawerWidth = Math.min(screenW * DRAWER_WIDTH_RATIO, 320);
  const router = useRouter();
  const navigatingRef = useRef(false);

  const openDrawer = useCallback(() => {
    if (navigatingRef.current) return;
    setOpen(true);
    progress.value = withSpring(1, SPRING);
  }, [progress]);

  const closeDrawer = useCallback(() => {
    setOpen(false);
    progress.value = withSpring(0, SPRING);
  }, [progress]);

  const toggleDrawer = useCallback(() => {
    if (open) closeDrawer();
    else openDrawer();
  }, [open, openDrawer, closeDrawer]);

  const finishNavigate = useCallback(
    (href: string) => {
      navigatingRef.current = false;
      setOpen(false);
      /**
       * WHY navigate, not push: the drawer switches between the four tab-group
       * screens (Home / Tasset / Search / Settings). router.push STACKS a new
       * screen on top, which shows the previous screen sliding/fading under
       * the new one (the "previous screen for a while" flash) and grows the
       * back-stack every time. router.navigate switches to the target within
       * the group without that push animation and without stacking, so the
       * destination appears immediately.
       */
      router.navigate(href as never);
    },
    [router],
  );

  const navigateFromDrawer = useCallback(
    (href: string) => {
      if (navigatingRef.current) return;
      navigatingRef.current = true;
      /**
       * WHY navigate first, then close: waiting for the 280ms close animation
       * to finish before navigating meant the user stared at the PREVIOUS
       * screen for that whole time while the drawer slid shut. Navigating
       * immediately makes the destination appear at once; the drawer's own
       * close animation then plays over the already-correct screen.
       */
      finishNavigate(href);
      progress.value = withTiming(0, {
        duration: CLOSE_MS,
        easing: Easing.out(Easing.cubic),
      });
    },
    [progress, finishNavigate],
  );

  const value = useMemo(
    () => ({
      open,
      progress,
      drawerWidth,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      navigateFromDrawer,
    }),
    [
      open,
      progress,
      drawerWidth,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      navigateFromDrawer,
    ],
  );

  return (
    <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>
  );
}

export function useDrawer() {
  const ctx = useContext(DrawerContext);
  if (!ctx) {
    throw new Error("useDrawer must be used within DrawerProvider");
  }
  return ctx;
}

export function useDrawerOptional() {
  return useContext(DrawerContext);
}

export { CLOSE_MS, SPRING };
