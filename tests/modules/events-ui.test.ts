import { describe, expect, it } from "vitest";
import { dateTileParts, formatTime12 } from "@/lib/dates";
import {
  ADD_NEW_TYPE,
  compareEvents,
  eventTypeOptions,
  groupEventsByDate,
} from "@/modules/events/format";
import { addEventTypeSchema, createEventSchema, updateEventSchema } from "@/modules/events/schema";

const ev = (name: string, date: string, time: string, type = "Haldi") => ({
  name,
  date,
  time,
  type,
});

describe("groupEventsByDate", () => {
  it("groups by day, in date order, with the time order kept inside a day", () => {
    const groups = groupEventsByDate([
      ev("Reception", "2027-02-15", "19:00", "Reception"),
      ev("Mehendi", "2027-02-13", "17:30", "Mehendi"),
      ev("Haldi", "2027-02-13", "10:00"),
      ev("Engagement", "2027-02-12", "18:00", "Engagement"),
    ]);
    expect(groups.map((g) => g.date)).toEqual(["2027-02-12", "2027-02-13", "2027-02-15"]);
    expect(groups[1]?.events.map((e) => e.name)).toEqual(["Haldi", "Mehendi"]);
  });

  it("writes the heading in the app's long date style with the weekday", () => {
    expect(groupEventsByDate([ev("Engagement", "2027-02-12", "18:00")])[0]?.heading).toBe(
      "Friday, 12 February 2027",
    );
  });

  it("counts events, singular and plural", () => {
    const groups = groupEventsByDate([
      ev("Haldi", "2027-02-13", "10:00"),
      ev("Mehendi", "2027-02-13", "17:30"),
      ev("Reception", "2027-02-15", "19:00", "Reception"),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["2 events", "1 event"]);
  });

  it("calls the day of the Wedding event 'Wedding Day'", () => {
    const [group] = groupEventsByDate([
      ev("Sangeet", "2027-02-14", "20:00", "Sangeet"),
      ev("Muhurtham", "2027-02-14", "06:45", "Wedding (Muhurtham)"),
    ]);
    expect(group?.label).toBe("Wedding Day");
  });

  it("does not change the list it was given", () => {
    const list = [ev("B", "2027-02-14", "10:00"), ev("A", "2027-02-12", "10:00")];
    groupEventsByDate(list);
    expect(list.map((e) => e.name)).toEqual(["B", "A"]);
  });

  it("returns nothing for no events", () => {
    expect(groupEventsByDate([])).toEqual([]);
  });
});

describe("compareEvents", () => {
  it("sorts by date, then time", () => {
    const sorted = [
      ev("c", "2027-02-14", "19:00"),
      ev("a", "2027-02-12", "23:00"),
      ev("b", "2027-02-14", "07:00"),
    ].sort(compareEvents);
    expect(sorted.map((e) => e.name)).toEqual(["a", "b", "c"]);
  });
});

describe("time and date tile", () => {
  it("writes times as 12-hour with AM or PM", () => {
    expect(formatTime12("00:00")).toBe("12:00 AM");
    expect(formatTime12("06:45")).toBe("6:45 AM");
    expect(formatTime12("10:00")).toBe("10:00 AM");
    expect(formatTime12("12:00")).toBe("12:00 PM");
    expect(formatTime12("19:05")).toBe("7:05 PM");
    expect(formatTime12("23:59")).toBe("11:59 PM");
  });

  it("splits a date for the small tile", () => {
    expect(dateTileParts("2027-02-12")).toEqual({ day: "12", month: "Feb", weekday: "Fri" });
  });
});

describe("eventTypeOptions", () => {
  it("lists the defaults, then custom types, then '+ Add new type' last", () => {
    const options = eventTypeOptions(["Nalugu"]);
    const labels = options.map((o) => o.label);
    expect(labels.slice(0, 8)).toEqual([
      "Engagement",
      "Haldi",
      "Mehendi",
      "Sangeet",
      "Pellikuthuru / Pellikoduku",
      "Wedding (Muhurtham)",
      "Reception",
      "Vratham / Pooja",
    ]);
    expect(labels[8]).toBe("Nalugu");
    expect(options.at(-1)).toEqual({ value: ADD_NEW_TYPE, label: "+ Add new type" });
    expect(options.at(-2)?.disabled).toBe(true);
  });

  it("is just the defaults and the add option when there are no custom types", () => {
    expect(eventTypeOptions([])).toHaveLength(8 + 2);
  });
});

describe("the form schemas the drawer reuses", () => {
  const valid = {
    name: "Sangeet Night",
    type: "Sangeet",
    date: "2027-02-12",
    time: "18:30",
    venueName: "Novotel Varun Beach",
  };

  it("needs name, type, date, time and venue", () => {
    const result = createEventSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(Object.keys(result.error?.flatten().fieldErrors ?? {}).sort()).toEqual([
      "date",
      "name",
      "time",
      "type",
      "venueName",
    ]);
  });

  it("treats the form's empty optional fields as not set", () => {
    const result = createEventSchema.parse({
      ...valid,
      address: "",
      mapLink: " ",
      dressCode: "",
      notes: "",
      youtubeLink: "",
    });
    expect(result).toEqual(valid);
  });

  it("checks the map and live links", () => {
    expect(createEventSchema.safeParse({ ...valid, mapLink: "http://x.example" }).success).toBe(
      false,
    );
    expect(
      createEventSchema.safeParse({ ...valid, youtubeLink: "https://vimeo.com/1" }).success,
    ).toBe(false);
    expect(
      createEventSchema.safeParse({ ...valid, youtubeLink: "https://youtu.be/abc" }).success,
    ).toBe(true);
  });

  it("clears an optional field on update with an empty string or null", () => {
    const result = updateEventSchema.parse({ ...valid, address: "", youtubeLink: null });
    expect(result.address).toBeNull();
    expect(result.youtubeLink).toBeNull();
  });

  it("refuses an update with nothing in it", () => {
    expect(updateEventSchema.safeParse({}).success).toBe(false);
  });

  it("trims a new type name and refuses an empty one", () => {
    expect(addEventTypeSchema.parse({ name: "  Nalugu " })).toEqual({ name: "Nalugu" });
    expect(addEventTypeSchema.safeParse({ name: "   " }).success).toBe(false);
  });
});
