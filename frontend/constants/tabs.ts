import { Ionicons } from "@expo/vector-icons";

export type TabDef = {
  name:        string;
  title:       string;
  icon:        keyof typeof Ionicons.glyphMap;
  iconFocused: keyof typeof Ionicons.glyphMap;
};

export const TABS: TabDef[] = [
  { name: "home",     title: "Home",     icon: "home-outline",      iconFocused: "home"        },
  { name: "search",   title: "Search",   icon: "search-outline",    iconFocused: "search"      },
  { name: "bookings", title: "Bookings", icon: "calendar-outline",  iconFocused: "calendar"    },
  { name: "chat",     title: "Messages", icon: "chatbubble-outline", iconFocused: "chatbubble"  },
  { name: "profile",  title: "Profile",  icon: "person-outline",    iconFocused: "person"      },
];
