let activeConversationBookingId: number | null = null;

export function setActiveConversationBookingId(bookingId: number | null) {
  activeConversationBookingId = bookingId;
}

export function getActiveConversationBookingId() {
  return activeConversationBookingId;
}
