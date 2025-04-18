import { Card, CardContent } from "@/components/ui/card";
import { ContactForm } from "./contact-form";

export default function Page() {
  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <Card>
          <CardContent>
            <ContactForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
