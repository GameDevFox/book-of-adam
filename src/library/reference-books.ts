/**
 * The books a typed reference can name (reference.ts), with the Library edition and file each
 * opens. Ported from the owner's scripture shortcut (lessons/scripts/scripture.js, which opened
 * churchofjesuschrist.org), extended with the Apocrypha. Each book also answers to its title and
 * file id; matching ignores case, spaces and punctuation, so "1 Ne", "1ne" and "1-ne" are one alias.
 */

export type Book = {
  title: string;
  edition: string;
  file: string;
  /** Chapters (sections, for the D&C). With one, a lone number is a verse ("AoF 13"). */
  chapters: number;
  aliases: string[];
};

const book =
  (edition: string) =>
  (title: string, file: string, chapters: number, ...aliases: string[]): Book => ({
    title,
    edition,
    file,
    chapters,
    aliases,
  });

const ot = book("kjv");
const bofm = book("bofm-lds");
const dc = book("dc-lds");
const pgp = book("pgp-lds");
const apoc = book("kjv-apocrypha");

export const BOOKS: Book[] = [
  // Old Testament
  ot("Genesis", "genesis", 50, "gen"),
  ot("Exodus", "exodus", 40, "ex"),
  ot("Leviticus", "leviticus", 27, "lev"),
  ot("Numbers", "numbers", 36, "num"),
  ot("Deuteronomy", "deuteronomy", 34, "deut"),
  ot("Joshua", "joshua", 24, "josh"),
  ot("Judges", "judges", 21, "judg"),
  ot("Ruth", "ruth", 4),
  ot("1 Samuel", "1-samuel", 31, "1 sam", "first samuel"),
  ot("2 Samuel", "2-samuel", 24, "2 sam", "second samuel"),
  ot("1 Kings", "1-kings", 22, "1 kgs", "first kings"),
  ot("2 Kings", "2-kings", 25, "2 kgs", "second kings"),
  ot("1 Chronicles", "1-chronicles", 29, "1 chr", "first chronicles"),
  ot("2 Chronicles", "2-chronicles", 36, "2 chr", "second chronicles"),
  ot("Ezra", "ezra", 10),
  ot("Nehemiah", "nehemiah", 13, "neh"),
  ot("Esther", "esther", 10, "esth"),
  ot("Job", "job", 42),
  ot("Psalms", "psalms", 150, "ps", "psalm"),
  ot("Proverbs", "proverbs", 31, "prov"),
  ot("Ecclesiastes", "ecclesiastes", 12, "eccl"),
  ot("Song of Solomon", "solomon-s-song", 8, "song", "song of songs", "canticles"),
  ot("Isaiah", "isaiah", 66, "isa"),
  ot("Jeremiah", "jeremiah", 52, "jer"),
  ot("Lamentations", "lamentations", 5, "lam"),
  ot("Ezekiel", "ezekiel", 48, "ezek"),
  ot("Daniel", "daniel", 12, "dan"),
  ot("Hosea", "hosea", 14),
  ot("Joel", "joel", 3),
  ot("Amos", "amos", 9),
  ot("Obadiah", "obadiah", 1, "obad"),
  ot("Jonah", "jonah", 4),
  ot("Micah", "micah", 7),
  ot("Nahum", "nahum", 3),
  ot("Habakkuk", "habakkuk", 3, "hab"),
  ot("Zephaniah", "zephaniah", 3, "zeph"),
  ot("Haggai", "haggai", 2, "hag"),
  ot("Zechariah", "zechariah", 14, "zech"),
  ot("Malachi", "malachi", 4, "mal"),

  // New Testament
  ot("Matthew", "matthew", 28, "matt", "mt"),
  ot("Mark", "mark", 16, "mk"),
  ot("Luke", "luke", 24, "lk"),
  ot("John", "john", 21, "jn"),
  ot("Acts", "acts", 28, "act"),
  ot("Romans", "romans", 16, "rom"),
  ot("1 Corinthians", "1-corinthians", 16, "1 cor", "first corinthians"),
  ot("2 Corinthians", "2-corinthians", 13, "2 cor", "second corinthians"),
  ot("Galatians", "galatians", 6, "gal"),
  ot("Ephesians", "ephesians", 6, "eph"),
  ot("Philippians", "philippians", 4, "phil"),
  ot("Colossians", "colossians", 4, "col"),
  ot("1 Thessalonians", "1-thessalonians", 5, "1 thes", "first thessalonians"),
  ot("2 Thessalonians", "2-thessalonians", 3, "2 thes", "second thessalonians"),
  ot("1 Timothy", "1-timothy", 6, "1 tim", "first timothy"),
  ot("2 Timothy", "2-timothy", 4, "2 tim", "second timothy"),
  ot("Titus", "titus", 3, "tit"),
  ot("Philemon", "philemon", 1, "philem"),
  ot("Hebrews", "hebrews", 13, "heb"),
  ot("James", "james", 5, "jas"),
  ot("1 Peter", "1-peter", 5, "1 pet", "first peter"),
  ot("2 Peter", "2-peter", 3, "2 pet", "second peter"),
  ot("1 John", "1-john", 5, "1 jn", "first john"),
  ot("2 John", "2-john", 1, "2 jn", "second john"),
  ot("3 John", "3-john", 1, "3 jn", "third john"),
  ot("Jude", "jude", 1),
  ot("Revelation", "revelation", 22, "rev", "revelations"),

  // Book of Mormon
  bofm("1 Nephi", "1-nephi", 22, "1 ne", "first nephi"),
  bofm("2 Nephi", "2-nephi", 33, "2 ne", "second nephi"),
  bofm("Jacob", "jacob", 7),
  bofm("Enos", "enos", 1),
  bofm("Jarom", "jarom", 1),
  bofm("Omni", "omni", 1),
  bofm("Words of Mormon", "words-of-mormon", 1, "w of m", "wm"),
  bofm("Mosiah", "mosiah", 29),
  bofm("Alma", "alma", 63),
  bofm("Helaman", "helaman", 16, "hel"),
  bofm("3 Nephi", "3-nephi", 30, "3 ne", "third nephi"),
  bofm("4 Nephi", "4-nephi", 1, "4 ne", "fourth nephi"),
  bofm("Mormon", "mormon", 9, "morm"),
  bofm("Ether", "ether", 15),
  bofm("Moroni", "moroni", 10, "moro"),

  // Doctrine and Covenants — sections in the chapter slot
  dc("Doctrine and Covenants", "doctrine-and-covenants", 138, "dc", "d and c", "dnc"),

  // Pearl of Great Price
  pgp("Moses", "moses", 8, "mos"),
  pgp("Abraham", "abraham", 5, "abr"),
  pgp("Joseph Smith—Matthew", "joseph-smith-matthew", 1, "js m", "js matthew"),
  pgp("Joseph Smith—History", "joseph-smith-history", 1, "js h", "js history"),
  pgp("Articles of Faith", "articles-of-faith", 1, "aof", "a of f"),

  // Apocrypha (KJV)
  apoc("1 Esdras", "i-esdras", 9, "1 esd", "first esdras"),
  apoc("2 Esdras", "ii-esdras", 16, "2 esd", "second esdras"),
  apoc("Tobit", "tobit", 14, "tob"),
  apoc("Judith", "judith", 16, "jdt"),
  apoc("Additions to Esther", "additions-to-esther", 16, "add esth", "rest of esther"),
  apoc("Wisdom of Solomon", "wisdom", 19, "wis"),
  apoc("Sirach", "sirach", 51, "sir", "ecclesiasticus", "ecclus"),
  apoc("Baruch", "baruch", 6, "bar"),
  apoc("Prayer of Azariah", "prayer-of-azariah", 1, "pr azar", "song of the three"),
  apoc("Susanna", "susanna", 1, "sus"),
  apoc("Bel and the Dragon", "bel-and-the-dragon", 1, "bel"),
  apoc("Prayer of Manasses", "prayer-of-manasses", 1, "pr man", "manasseh"),
  apoc("1 Maccabees", "i-maccabees", 16, "1 macc", "first maccabees"),
  apoc("2 Maccabees", "ii-maccabees", 15, "2 macc", "second maccabees"),
];

/** The Journal of Discourses: volume and page, opened by its citation URL (citations.ts). */
export const JOD_ALIASES = ["jd", "jod", "journal of discourses"];
export const JOD_VOLUMES = 26;
