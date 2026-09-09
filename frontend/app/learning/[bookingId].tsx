import { useLocalSearchParams } from "expo-router";
import { Page, ErrorNotice } from "@/components/ui/Workspace";
import LearningWorkspace from "@/components/LearningWorkspace";
import SessionDetails from "@/components/SessionDetails";

export default function SessionLearning() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const id = Number(bookingId);
  return <Page title="Your learning space" subtitle="One place for lesson conversations, materials, and practice.">
    {Number.isInteger(id) && id > 0 ? <><SessionDetails bookingId={id} /><LearningWorkspace bookingId={id} /></> : <ErrorNotice message="This session link is invalid." />}
  </Page>;
}
