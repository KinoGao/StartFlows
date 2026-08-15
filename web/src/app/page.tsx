import { redirect } from "next/navigation";

import { getInstallStatus } from "@/lib/server/install-status";
import { getPublicSiteSettings } from "@/lib/server/site-metadata";
import { HomeActionsProvider } from "./home/home-actions";
import { HomeAgentHero } from "./home/home-agent-hero";
import { HomeCta, HomeFooter } from "./home/home-footer";
import { HomeGallery } from "./home/home-gallery";
import { HomeHeader } from "./home/home-header";
import { HomeAdvantagesSection, HomeStepsSection } from "./home/home-static-sections";
import styles from "./home/home.module.css";

export const dynamic = "force-dynamic";

export default async function HomePage() {
    const [install, site] = await Promise.all([getInstallStatus(), getPublicSiteSettings()]);
    if (!install.ready) redirect("/install");

    return (
        <HomeActionsProvider initialSite={site}>
            <main className={`app-scroll-page ${styles.root}`}>
                <HomeHeader />
                <HomeAgentHero />
                <div className={styles.contentBand}>
                    <HomeStepsSection />
                    <HomeGallery />
                    <HomeAdvantagesSection />
                    <HomeCta />
                    <HomeFooter />
                </div>
            </main>
        </HomeActionsProvider>
    );
}
