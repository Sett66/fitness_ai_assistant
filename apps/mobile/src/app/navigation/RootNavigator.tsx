import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import {
  Dumbbell,
  Home,
  MessageCircle,
  stackHeaderOptions,
  tabBarOptions,
  useTheme,
  User,
  Users,
} from '@fitness/ui';

import { LoginScreen } from '../../features/auth/LoginScreen';
import { RegisterScreen } from '../../features/auth/RegisterScreen';
import { CoachScreen } from '../../features/coach/CoachScreen';
import { SocialPlaceholderScreen } from '../../features/coach/SocialPlaceholderScreen';
import { DashboardScreen } from '../../features/dashboard/DashboardScreen';
import { ProfileScreen } from '../../features/profile/ProfileScreen';
import { PlanListScreen } from '../../features/plan/PlanListScreen';
import { PlanDetailScreen } from '../../features/plan/PlanDetailScreen';
import { WorkoutScreen } from '../../features/workout/WorkoutScreen';
import { MealVisionResultScreen } from '../../features/nutrition/MealVisionResultScreen';
import type { MealType } from '@fitness/shared';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  Coach: undefined;
  Workout: undefined;
  Social: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  PlanList: undefined;
  PlanDetail: { planId: string };
  MealVisionResult: { result: unknown; mealType: MealType };
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

function tabLabel(label: string) {
  return ({ color }: { color: string }) => <Text style={{ color, fontSize: 11 }}>{label}</Text>;
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: tabBarOptions.activeTintColor,
        tabBarInactiveTintColor: tabBarOptions.inactiveTintColor,
        tabBarStyle: {
          backgroundColor: tabBarOptions.backgroundColor,
          borderTopColor: tabBarOptions.borderTopColor,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 6,
          paddingTop: 6,
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: '首页',
          tabBarLabel: tabLabel('首页'),
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} strokeWidth={1.5} />,
        }}
      />
      <Tab.Screen
        name="Coach"
        component={CoachScreen}
        options={{
          title: 'Coach',
          tabBarLabel: tabLabel('Coach'),
          tabBarIcon: ({ color, size }) => (
            <MessageCircle color={color} size={size} strokeWidth={1.5} />
          ),
        }}
      />
      <Tab.Screen
        name="Workout"
        component={WorkoutScreen}
        options={{
          title: '打卡',
          tabBarLabel: tabLabel('打卡'),
          tabBarIcon: ({ color, size }) => <Dumbbell color={color} size={size} strokeWidth={1.5} />,
        }}
      />
      <Tab.Screen
        name="Social"
        component={SocialPlaceholderScreen}
        options={{
          title: '社区',
          tabBarLabel: tabLabel('社区'),
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} strokeWidth={1.5} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: '我的',
          tabBarLabel: tabLabel('我的'),
          tabBarIcon: ({ color, size }) => <User color={color} size={size} strokeWidth={1.5} />,
        }}
      />
    </Tab.Navigator>
  );
}

type RootNavigatorProps = { mode: 'auth' | 'main' };

export function RootNavigator({ mode }: RootNavigatorProps) {
  return (
    <RootStack.Navigator screenOptions={stackHeaderOptions}>
      {mode === 'auth' ? (
        <RootStack.Screen name="Auth" component={AuthNavigator} options={{ headerShown: false }} />
      ) : (
        <>
          <RootStack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
          <RootStack.Screen
            name="PlanList"
            component={PlanListScreen}
            options={{ title: '我的计划' }}
          />
          <RootStack.Screen
            name="PlanDetail"
            component={PlanDetailScreen}
            options={{ title: '计划详情' }}
          />
          <RootStack.Screen
            name="MealVisionResult"
            component={MealVisionResultScreen}
            options={{ title: '识别结果' }}
          />
        </>
      )}
    </RootStack.Navigator>
  );
}

export function AppNavigationContainer({ children }: { children: ReactNode }) {
  const { navigationTheme } = useTheme();
  return <NavigationContainer theme={navigationTheme}>{children}</NavigationContainer>;
}
