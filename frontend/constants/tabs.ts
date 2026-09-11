import { Ionicons } from "@expo/vector-icons";

export type TabDef = {
  name:        string;
  title:       string;
  icon:        keyof typeof Ionicons.glyphMap;
  iconFocused: keyof typeof Ionicons.glyphMap;
};

export const TABS: TabDef[] = [
  { name: "home",      title: "Home",     icon: "home-outline",      iconFocused: "home"        },
  { name: "search",    title: "Search",   icon: "search-outline",    iconFocused: "search"      },
  { name: "bookings",  title: "Bookings", icon: "calendar-outline",  iconFocused: "calendar"    },
  { name: "chat",      title: "Learning", icon: "book-outline", iconFocused: "book"  },
  { name: "profile",   title: "Profile",  icon: "person-outline",    iconFocused: "person"      },
];

export const TUTOR_TABS: TabDef[] = [
  { name: "dashboard", title: "Dashboard", icon: "grid-outline",      iconFocused: "grid"        },
  { name: "sessions",  title: "Sessions",  icon: "calendar-outline",  iconFocused: "calendar"    },
  { name: "students",  title: "Students",  icon: "people-outline",    iconFocused: "people"      },
  { name: "earnings",  title: "Earnings",  icon: "wallet-outline",    iconFocused: "wallet"      },
  { name: "profile",   title: "Profile",   icon: "person-outline",    iconFocused: "person"      },
];
