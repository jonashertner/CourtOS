import { COURTOS_HOME } from "@/app/lib/courtos";
import { redirect } from "next/navigation";

export default function RootPage() {
    redirect(COURTOS_HOME);
}
