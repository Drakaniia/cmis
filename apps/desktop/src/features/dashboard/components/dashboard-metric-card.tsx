import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@cmis/ui/components/card";
import { cn } from "@cmis/ui/lib/utils";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

type IconType =
  | React.ElementType
  | React.FunctionComponent<React.SVGProps<SVGSVGElement>>;

export type TrendType = "up" | "down" | "neutral";

export interface DashboardMetricCardProps {
  /** Optional class name for the card container. */
  className?: string;
  /** Optional icon to display in the card header. */
  icon?: IconType;
  /** The descriptive title of the metric (e.g., "Total Users", "Revenue"). */
  title: string;
  /** The percentage or absolute change for the trend (e.g., "2.5%"). */
  trendChange?: string;
  /** The direction of the trend ('up', 'down', 'neutral'). */
  trendType?: TrendType;
  /** The main value of the metric (e.g., "1,234", "$5.6M", "92%"). */
  value: string;
}

/**
 * A professional, animated metric card for admin dashboards.
 * Displays a key value, title, icon, and trend indicator with motion hover effects.
 */
const DashboardMetricCard: React.FC<DashboardMetricCardProps> = ({
  value,
  title,
  icon: IconComponent,
  trendChange,
  trendType = "neutral",
  className,
}) => {
  const TrendIcon =
    trendType === "up" ? ArrowUp : trendType === "down" ? ArrowDown : Minus;
  const trendColorClass =
    trendType === "up"
      ? "text-green-600 dark:text-green-400"
      : trendType === "down"
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";

  return (
    <div className={cn("cursor-pointer rounded-lg", className)}>
      <Card className="h-full transition-colors duration-200">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="font-medium text-muted-foreground text-sm">
            {title}
          </CardTitle>
          {IconComponent && (
            <IconComponent
              aria-hidden="true"
              className="h-4 w-4 text-muted-foreground"
            />
          )}
        </CardHeader>
        <CardContent>
          <div className="mb-2 font-bold text-2xl text-foreground">{value}</div>
          {trendChange && (
            <p
              className={cn(
                "flex items-center font-medium text-xs",
                trendColorClass
              )}
            >
              <TrendIcon aria-hidden="true" className="mr-1 h-3 w-3" />
              {trendChange}{" "}
              {trendType === "up"
                ? "increase"
                : trendType === "down"
                  ? "decrease"
                  : "change"}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export { DashboardMetricCard };
