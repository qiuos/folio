"""
Seed script for Folio library system.

Populates the database with 25+ realistic Chinese and English books,
along with authors, tags, publishers, series, and categories.

Usage:
    cd backend/
    python -m scripts.seed
"""
from __future__ import annotations

import sys
from pathlib import Path

# Ensure the backend root is on sys.path so `app` is importable
sys.path.insert(0, str(Path(__file__).resolve().parent))

from datetime import datetime, timezone

from sqlmodel import Session, select

from app.db.session import get_engine
from app.models import (
    Author,
    Book,
    BookAuthor,
    BookCategory,
    BookFormat,
    BookTag,
    Category,
    Identifier,
    MetadataCache,
    Publisher,
    ReadingNote,
    ReadingProgress,
    Series,
    Shelf,
    ShelfItem,
    Tag,
    User,
)


# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------

PUBLISHERS = [
    {"name": "Chongqing Publishing House", "description": "Chinese publisher known for sci-fi translations"},
    {"name": "People's Literature Publishing House", "description": "Major Chinese literary publisher"},
    {"name": "Shanghai Translation Publishing House", "description": "Chinese publisher specializing in translations"},
    {"name": "Penguin Books", "description": "British publishing house"},
    {"name": "Tor Books", "description": "American science fiction and fantasy publisher"},
    {"name": "HarperCollins", "description": "One of the Big Five English-language publishers"},
    {"name": "Random House", "description": "American publishing company"},
    {"name": "CITIC Press", "description": "Chinese publisher for business and popular science"},
]

SERIES = [
    {"name": "Three-Body Problem", "description": "The Remembrance of Earth's Past trilogy by Liu Cixin"},
    {"name": "Foundation Universe", "description": "Isaac Asimov's Foundation series"},
    {"name": "Dune Chronicles", "description": "Frank Herbert's Dune series"},
    {"name": "A Song of Ice and Fire", "description": "George R.R. Martin's epic fantasy series"},
]

AUTHORS = [
    {"name": "Liu Cixin", "sort_name": "Liu, Cixin", "bio": "Chinese science fiction writer, Hugo Award winner"},
    {"name": "Gabriel Garcia Marquez", "sort_name": "Marquez, Gabriel Garcia", "bio": "Colombian novelist, Nobel Prize in Literature laureate"},
    {"name": "George Orwell", "sort_name": "Orwell, George", "bio": "English novelist and essayist"},
    {"name": "Frank Herbert", "sort_name": "Herbert, Frank", "bio": "American science fiction author"},
    {"name": "Isaac Asimov", "sort_name": "Asimov, Isaac", "bio": "American science fiction writer and biochemist"},
    {"name": "Yuval Noah Harari", "sort_name": "Harari, Yuval Noah", "bio": "Israeli historian and professor at Hebrew University"},
    {"name": "J.D. Salinger", "sort_name": "Salinger, J.D.", "bio": "American writer known for The Catcher in the Rye"},
    {"name": "George R.R. Martin", "sort_name": "Martin, George R.R.", "bio": "American fantasy and science fiction author"},
    {"name": "F. Scott Fitzgerald", "sort_name": "Fitzgerald, F. Scott", "bio": "American novelist and short story writer"},
    {"name": "Albert Camus", "sort_name": "Camus, Albert", "bio": "French philosopher and Nobel Prize laureate"},
    {"name": "Milan Kundera", "sort_name": "Kundera, Milan", "bio": "Czech-born French writer"},
    {"name": "Kazuo Ishiguro", "sort_name": "Ishiguro, Kazuo", "bio": "British novelist, Nobel Prize in Literature laureate"},
    {"name": "Ursula K. Le Guin", "sort_name": "Le Guin, Ursula K.", "bio": "American science fiction and fantasy author"},
    {"name": "Lu Xun", "sort_name": "Lu, Xun", "bio": "Chinese writer, essayist, and poet, a leading figure of modern Chinese literature"},
    {"name": "Lao She", "sort_name": "Lao, She", "bio": "Chinese novelist and dramatist"},
    {"name": "Mo Yan", "sort_name": "Mo, Yan", "bio": "Chinese novelist, Nobel Prize in Literature laureate"},
    {"name": "Hermann Hesse", "sort_name": "Hesse, Hermann", "bio": "German-Swiss poet, novelist, and painter, Nobel Prize laureate"},
    {"name": "Daniel Keyes", "sort_name": "Keyes, Daniel", "bio": "American author best known for Flowers for Algernon"},
]

TAGS = [
    {"name": "Science Fiction", "color": "#3B82F6"},
    {"name": "Fantasy", "color": "#8B5CF6"},
    {"name": "Literary Fiction", "color": "#EC4899"},
    {"name": "Classic", "color": "#F59E0B"},
    {"name": "Dystopian", "color": "#EF4444"},
    {"name": "Philosophy", "color": "#10B981"},
    {"name": "History", "color": "#6366F1"},
    {"name": "Chinese Literature", "color": "#F97316"},
    {"name": "Nobel Prize", "color": "#D97706"},
    {"name": "Hard Sci-Fi", "color": "#0EA5E9"},
    {"name": "Space Opera", "color": "#7C3AED"},
    {"name": "Magical Realism", "color": "#E11D48"},
]

CATEGORIES = [
    {"name": "Fiction"},
    {"name": "Science Fiction", "parent": "Fiction"},
    {"name": "Fantasy", "parent": "Fiction"},
    {"name": "Literary Fiction", "parent": "Fiction"},
    {"name": "Non-Fiction"},
    {"name": "History", "parent": "Non-Fiction"},
    {"name": "Philosophy", "parent": "Non-Fiction"},
    {"name": "Science", "parent": "Non-Fiction"},
    {"name": "Biography", "parent": "Non-Fiction"},
]

# fmt: off
BOOKS = [
    {
        "title": "The Three-Body Problem",
        "subtitle": None,
        "description": "Set against the backdrop of China's Cultural Revolution, a secret military project sends signals into space to establish contact with aliens. An alien civilization on the brink of destruction captures the signal and plans to invade Earth.",
        "language": "zh",
        "page_count": 302,
        "published_date": "2008-01-01",
        "publisher": "Chongqing Publishing House",
        "authors": [("Liu Cixin", "author"), ("Ken Liu", "translator")],
        "series": ("Three-Body Problem", 1.0),
        "tags": ["Science Fiction", "Hard Sci-Fi", "Chinese Literature"],
        "categories": ["Fiction", "Science Fiction"],
        "identifiers": [("isbn13", "9787229042066")],
        "formats": [("epub", 512000), ("pdf", 2048000)],
        "rating": 4.5,
    },
    {
        "title": "The Dark Forest",
        "subtitle": None,
        "description": "In the aftermath of Earth's first contact with the Trisolarans, humanity faces an existential threat. The UN creates the Wallfacer Project, a daring plan to hide strategic defense initiatives from an enemy that can see everything.",
        "language": "zh",
        "page_count": 400,
        "published_date": "2008-06-01",
        "publisher": "Chongqing Publishing House",
        "authors": [("Liu Cixin", "author"), ("Joel Martinsen", "translator")],
        "series": ("Three-Body Problem", 2.0),
        "tags": ["Science Fiction", "Hard Sci-Fi"],
        "categories": ["Fiction", "Science Fiction"],
        "identifiers": [("isbn13", "9787229042073")],
        "formats": [("epub", 580000)],
        "rating": 4.7,
    },
    {
        "title": "Death's End",
        "subtitle": None,
        "description": "The conclusion to the Three-Body Problem trilogy. Cheng Xin, an aerospace engineer from the 21st century, emerges from hibernation into a future of peace and prosperity built on a lie.",
        "language": "zh",
        "page_count": 512,
        "published_date": "2010-11-01",
        "publisher": "Chongqing Publishing House",
        "authors": [("Liu Cixin", "author"), ("Ken Liu", "translator")],
        "series": ("Three-Body Problem", 3.0),
        "tags": ["Science Fiction", "Hard Sci-Fi", "Space Opera"],
        "categories": ["Fiction", "Science Fiction"],
        "identifiers": [("isbn13", "9787229042080")],
        "formats": [("epub", 650000), ("pdf", 3072000)],
        "rating": 4.6,
    },
    {
        "title": "One Hundred Years of Solitude",
        "subtitle": None,
        "description": "The brilliant, bestselling, landmark novel that tells the story of the Buendia family and the mythical town of Macondo through seven generations.",
        "language": "es",
        "page_count": 417,
        "published_date": "1967-05-30",
        "publisher": "HarperCollins",
        "authors": [("Gabriel Garcia Marquez", "author")],
        "series": None,
        "tags": ["Literary Fiction", "Magical Realism", "Classic", "Nobel Prize"],
        "categories": ["Fiction", "Literary Fiction"],
        "identifiers": [("isbn13", "9780060883287")],
        "formats": [("epub", 480000)],
        "rating": 4.8,
    },
    {
        "title": "1984",
        "subtitle": None,
        "description": "A dystopian social science fiction novel and cautionary tale about the dangers of totalitarianism. The story follows Winston Smith, a low-ranking member of the ruling Party in London.",
        "language": "en",
        "page_count": 328,
        "published_date": "1949-06-08",
        "publisher": "Penguin Books",
        "authors": [("George Orwell", "author")],
        "series": None,
        "tags": ["Dystopian", "Classic", "Literary Fiction"],
        "categories": ["Fiction", "Literary Fiction"],
        "identifiers": [("isbn13", "9780451524935")],
        "formats": [("epub", 350000), ("pdf", 1024000)],
        "rating": 4.7,
    },
    {
        "title": "Dune",
        "subtitle": None,
        "description": "Set on the desert planet Arrakis, Dune is the story of Paul Atreides who would become known as Muad'Dib. A stunning blend of adventure and mysticism, environmentalism and politics.",
        "language": "en",
        "page_count": 688,
        "published_date": "1965-08-01",
        "publisher": "Tor Books",
        "authors": [("Frank Herbert", "author")],
        "series": ("Dune Chronicles", 1.0),
        "tags": ["Science Fiction", "Space Opera", "Classic"],
        "categories": ["Fiction", "Science Fiction"],
        "identifiers": [("isbn13", "9780441172719")],
        "formats": [("epub", 720000)],
        "rating": 4.6,
    },
    {
        "title": "Dune Messiah",
        "subtitle": None,
        "description": "The sequel to Dune follows Paul Muad'Dib's reign as Emperor. Twelve years have passed since the events of Dune, and Paul's Fremen armies have conquered the galaxy.",
        "language": "en",
        "page_count": 337,
        "published_date": "1969-01-01",
        "publisher": "Tor Books",
        "authors": [("Frank Herbert", "author")],
        "series": ("Dune Chronicles", 2.0),
        "tags": ["Science Fiction", "Space Opera"],
        "categories": ["Fiction", "Science Fiction"],
        "identifiers": [("isbn13", "9780441470253")],
        "formats": [("epub", 420000)],
        "rating": 4.2,
    },
    {
        "title": "Foundation",
        "subtitle": None,
        "description": "The first novel in Isaac Asimov's Foundation trilogy. Mathematician Hari Seldon predicts the fall of the Galactic Empire and devises a plan to shorten the coming dark age.",
        "language": "en",
        "page_count": 244,
        "published_date": "1951-06-01",
        "publisher": "Random House",
        "authors": [("Isaac Asimov", "author")],
        "series": ("Foundation Universe", 1.0),
        "tags": ["Science Fiction", "Classic", "Space Opera"],
        "categories": ["Fiction", "Science Fiction"],
        "identifiers": [("isbn13", "9780553293357")],
        "formats": [("epub", 300000)],
        "rating": 4.5,
    },
    {
        "title": "Foundation and Empire",
        "subtitle": None,
        "description": "The second novel in the Foundation series. The Foundation faces the threat of the mutant conqueror known as the Mule.",
        "language": "en",
        "page_count": 247,
        "published_date": "1952-06-01",
        "publisher": "Random House",
        "authors": [("Isaac Asimov", "author")],
        "series": ("Foundation Universe", 2.0),
        "tags": ["Science Fiction", "Space Opera"],
        "categories": ["Fiction", "Science Fiction"],
        "identifiers": [("isbn13", "9780553293371")],
        "formats": [("epub", 310000)],
        "rating": 4.4,
    },
    {
        "title": "Sapiens: A Brief History of Humankind",
        "subtitle": None,
        "description": "A groundbreaking narrative of humanity's creation and evolution that explores how biology and history have defined us.",
        "language": "en",
        "page_count": 443,
        "published_date": "2011-01-01",
        "publisher": "HarperCollins",
        "authors": [("Yuval Noah Harari", "author")],
        "series": None,
        "tags": ["History", "Philosophy"],
        "categories": ["Non-Fiction", "History"],
        "identifiers": [("isbn13", "9780062316097")],
        "formats": [("epub", 530000), ("pdf", 2560000)],
        "rating": 4.4,
    },
    {
        "title": "The Catcher in the Rye",
        "subtitle": None,
        "description": "The story of Holden Caulfield's disillusionment with the adult world and his quest for truth and innocence.",
        "language": "en",
        "page_count": 277,
        "published_date": "1951-07-16",
        "publisher": "Random House",
        "authors": [("J.D. Salinger", "author")],
        "series": None,
        "tags": ["Classic", "Literary Fiction"],
        "categories": ["Fiction", "Literary Fiction"],
        "identifiers": [("isbn13", "9780316769488")],
        "formats": [("epub", 280000)],
        "rating": 4.0,
    },
    {
        "title": "A Game of Thrones",
        "subtitle": "A Song of Ice and Fire, Book 1",
        "description": "In a land where summers span decades and winters can last a lifetime, the game of thrones is played for the fate of the Seven Kingdoms.",
        "language": "en",
        "page_count": 694,
        "published_date": "1996-08-06",
        "publisher": "Random House",
        "authors": [("George R.R. Martin", "author")],
        "series": ("A Song of Ice and Fire", 1.0),
        "tags": ["Fantasy", "Classic"],
        "categories": ["Fiction", "Fantasy"],
        "identifiers": [("isbn13", "9780553103540")],
        "formats": [("epub", 890000)],
        "rating": 4.5,
    },
    {
        "title": "A Clash of Kings",
        "subtitle": "A Song of Ice and Fire, Book 2",
        "description": "A comet the color of blood and flame cuts across the sky. And from the ancient citadel of Dragonstone to the forbidding shores of Winterfell, chaos reigns.",
        "language": "en",
        "page_count": 768,
        "published_date": "1998-11-16",
        "publisher": "Random House",
        "authors": [("George R.R. Martin", "author")],
        "series": ("A Song of Ice and Fire", 2.0),
        "tags": ["Fantasy"],
        "categories": ["Fiction", "Fantasy"],
        "identifiers": [("isbn13", "9780553108033")],
        "formats": [("epub", 920000)],
        "rating": 4.4,
    },
    {
        "title": "The Great Gatsby",
        "subtitle": None,
        "description": "The story of the mysteriously wealthy Jay Gatsby and his love for the beautiful Daisy Buchanan. A portrait of the Jazz Age in all its decadence.",
        "language": "en",
        "page_count": 180,
        "published_date": "1925-04-10",
        "publisher": "Penguin Books",
        "authors": [("F. Scott Fitzgerald", "author")],
        "series": None,
        "tags": ["Classic", "Literary Fiction"],
        "categories": ["Fiction", "Literary Fiction"],
        "identifiers": [("isbn13", "9780743273565")],
        "formats": [("epub", 220000)],
        "rating": 4.2,
    },
    {
        "title": "The Stranger",
        "subtitle": None,
        "description": "Through the story of an ordinary man unwittingly drawn into a senseless murder on an Algerian beach, Camus explored what he termed the nakedness of man faced with the absurd.",
        "language": "fr",
        "page_count": 123,
        "published_date": "1942-01-01",
        "publisher": "Penguin Books",
        "authors": [("Albert Camus", "author")],
        "series": None,
        "tags": ["Philosophy", "Classic", "Literary Fiction", "Nobel Prize"],
        "categories": ["Fiction", "Literary Fiction"],
        "identifiers": [("isbn13", "9780679720201")],
        "formats": [("epub", 180000)],
        "rating": 4.3,
    },
    {
        "title": "The Unbearable Lightness of Being",
        "subtitle": None,
        "description": "A young woman in love with a man torn between his love for her and his incorrigible womanizing; one of his mistresses and her humble faithful lover -- these are the two couples whose story is told in this masterful novel.",
        "language": "cs",
        "page_count": 314,
        "published_date": "1984-01-01",
        "publisher": "HarperCollins",
        "authors": [("Milan Kundera", "author")],
        "series": None,
        "tags": ["Literary Fiction", "Philosophy"],
        "categories": ["Fiction", "Literary Fiction"],
        "identifiers": [("isbn13", "9780060932138")],
        "formats": [("epub", 380000)],
        "rating": 4.3,
    },
    {
        "title": "Never Let Me Go",
        "subtitle": None,
        "description": "A story of love, friendship, and memory that follows Kathy, Tommy, and Ruth as they grow up at Hailsham, an exclusive English boarding school, and confront a dark secret about their purpose in life.",
        "language": "en",
        "page_count": 288,
        "published_date": "2005-03-03",
        "publisher": "Penguin Books",
        "authors": [("Kazuo Ishiguro", "author")],
        "series": None,
        "tags": ["Literary Fiction", "Dystopian", "Nobel Prize"],
        "categories": ["Fiction", "Literary Fiction"],
        "identifiers": [("isbn13", "9781400078776")],
        "formats": [("epub", 340000)],
        "rating": 4.1,
    },
    {
        "title": "The Left Hand of Darkness",
        "subtitle": None,
        "description": "A lone human ambassador is sent to the icebound planet of Winter to facilitate the planet's inclusion in a growing intergalactic civilization. A landmark exploration of gender and society.",
        "language": "en",
        "page_count": 304,
        "published_date": "1969-03-01",
        "publisher": "Penguin Books",
        "authors": [("Ursula K. Le Guin", "author")],
        "series": None,
        "tags": ["Science Fiction", "Classic", "Literary Fiction"],
        "categories": ["Fiction", "Science Fiction"],
        "identifiers": [("isbn13", "9780441478125")],
        "formats": [("epub", 360000)],
        "rating": 4.3,
    },
    {
        "title": "Call to Arms",
        "subtitle": None,
        "description": "A collection of short stories by Lu Xun that had a profound impact on modern Chinese literature and thought. Includes 'A Madman's Diary' and 'The True Story of Ah Q'.",
        "language": "zh",
        "page_count": 196,
        "published_date": "1922-01-01",
        "publisher": "People's Literature Publishing House",
        "authors": [("Lu Xun", "author"), ("Yang Hsien-yi", "translator"), ("Gladys Yang", "translator")],
        "series": None,
        "tags": ["Chinese Literature", "Classic"],
        "categories": ["Fiction", "Literary Fiction"],
        "identifiers": [("isbn13", "9780393001408")],
        "formats": [("epub", 250000)],
        "rating": 4.4,
    },
    {
        "title": "Rickshaw Boy",
        "subtitle": None,
        "description": "The story of Xiangzi, a hardworking, honest rickshaw puller in Beijing, and his struggle to achieve dignity in a corrupt society. One of the most important works of twentieth-century Chinese literature.",
        "language": "zh",
        "page_count": 248,
        "published_date": "1937-01-01",
        "publisher": "People's Literature Publishing House",
        "authors": [("Lao She", "author"), ("Jean M. James", "translator")],
        "series": None,
        "tags": ["Chinese Literature", "Classic"],
        "categories": ["Fiction", "Literary Fiction"],
        "identifiers": [("isbn13", "9780060953233")],
        "formats": [("epub", 290000)],
        "rating": 4.2,
    },
    {
        "title": "Red Sorghum",
        "subtitle": None,
        "description": "A novel of vast scope and sweeping vision that spans three generations of a Chinese family, set against the backdrop of the Japanese invasion and the Communist revolution.",
        "language": "zh",
        "page_count": 359,
        "published_date": "1987-01-01",
        "publisher": "Penguin Books",
        "authors": [("Mo Yan", "author"), ("Howard Goldblatt", "translator")],
        "series": None,
        "tags": ["Chinese Literature", "Magical Realism", "Nobel Prize"],
        "categories": ["Fiction", "Literary Fiction"],
        "identifiers": [("isbn13", "9780143128509")],
        "formats": [("epub", 420000)],
        "rating": 4.3,
    },
    {
        "title": "Siddhartha",
        "subtitle": None,
        "description": "A young Brahmin named Siddhartha embarks on a spiritual quest for enlightenment. Set in ancient India, the novel explores themes of self-discovery and the search for meaning.",
        "language": "de",
        "page_count": 152,
        "published_date": "1922-01-01",
        "publisher": "Penguin Books",
        "authors": [("Hermann Hesse", "author")],
        "series": None,
        "tags": ["Philosophy", "Classic", "Nobel Prize"],
        "categories": ["Fiction", "Literary Fiction"],
        "identifiers": [("isbn13", "9780142437180")],
        "formats": [("epub", 200000)],
        "rating": 4.4,
    },
    {
        "title": "Flowers for Algernon",
        "subtitle": None,
        "description": "The story of Charlie Gordon, a mentally disabled man who undergoes an experimental surgical procedure to increase his intelligence. Told through his journal entries.",
        "language": "en",
        "page_count": 311,
        "published_date": "1966-03-01",
        "publisher": "HarperCollins",
        "authors": [("Daniel Keyes", "author")],
        "series": None,
        "tags": ["Science Fiction", "Literary Fiction", "Classic"],
        "categories": ["Fiction", "Science Fiction"],
        "identifiers": [("isbn13", "9780156030084")],
        "formats": [("epub", 340000)],
        "rating": 4.5,
    },
    {
        "title": "Second Foundation",
        "subtitle": None,
        "description": "The third novel in Asimov's original Foundation trilogy. The Mule continues his search for the Second Foundation while the First Foundation also seeks to uncover its secret location.",
        "language": "en",
        "page_count": 255,
        "published_date": "1953-01-01",
        "publisher": "Random House",
        "authors": [("Isaac Asimov", "author")],
        "series": ("Foundation Universe", 3.0),
        "tags": ["Science Fiction", "Space Opera"],
        "categories": ["Fiction", "Science Fiction"],
        "identifiers": [("isbn13", "9780553293395")],
        "formats": [("epub", 310000)],
        "rating": 4.3,
    },
    {
        "title": "Homo Deus: A Brief History of Tomorrow",
        "subtitle": None,
        "description": "Yuval Noah Harari examines what might happen to the world when old myths combine with new technologies, from AI to genetic engineering, and what we can do about it.",
        "language": "en",
        "page_count": 449,
        "published_date": "2015-01-01",
        "publisher": "HarperCollins",
        "authors": [("Yuval Noah Harari", "author")],
        "series": None,
        "tags": ["History", "Philosophy", "Science"],
        "categories": ["Non-Fiction", "History"],
        "identifiers": [("isbn13", "9780062464313")],
        "formats": [("epub", 540000)],
        "rating": 4.2,
    },
]
# fmt: on


def seed() -> None:
    engine = get_engine()

    # Import all models so metadata is populated
    import app.models  # noqa: F401

    from sqlmodel import SQLModel

    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        # --- Publishers ---
        publisher_map: dict[str, Publisher] = {}
        for pub_data in PUBLISHERS:
            existing = session.exec(
                select(Publisher).where(Publisher.name == pub_data["name"])
            ).first()
            if existing is None:
                pub = Publisher(**pub_data)
                session.add(pub)
                session.flush()
                publisher_map[pub.name] = pub
                print(f"  Created publisher: {pub.name}")
            else:
                publisher_map[existing.name] = existing

        # --- Series ---
        series_map: dict[str, Series] = {}
        for ser_data in SERIES:
            existing = session.exec(
                select(Series).where(Series.name == ser_data["name"])
            ).first()
            if existing is None:
                ser = Series(**ser_data)
                session.add(ser)
                session.flush()
                series_map[ser.name] = ser
                print(f"  Created series: {ser.name}")
            else:
                series_map[existing.name] = existing

        # --- Authors ---
        author_map: dict[str, Author] = {}
        for auth_data in AUTHORS:
            existing = session.exec(
                select(Author).where(Author.name == auth_data["name"])
            ).first()
            if existing is None:
                auth = Author(**auth_data)
                session.add(auth)
                session.flush()
                author_map[auth.name] = auth
                print(f"  Created author: {auth.name}")
            else:
                author_map[existing.name] = existing

        # --- Tags ---
        tag_map: dict[str, Tag] = {}
        for tag_data in TAGS:
            existing = session.exec(
                select(Tag).where(Tag.name == tag_data["name"])
            ).first()
            if existing is None:
                tag = Tag(**tag_data)
                session.add(tag)
                session.flush()
                tag_map[tag.name] = tag
                print(f"  Created tag: {tag.name}")
            else:
                tag_map[existing.name] = existing

        # --- Categories ---
        category_map: dict[str, Category] = {}
        for cat_data in CATEGORIES:
            existing = session.exec(
                select(Category).where(Category.name == cat_data["name"])
            ).first()
            if existing is None:
                parent = None
                if "parent" in cat_data:
                    parent = category_map.get(cat_data["parent"])
                cat = Category(
                    name=cat_data["name"],
                    parent_id=parent.id if parent else None,
                    description=cat_data.get("description"),
                )
                session.add(cat)
                session.flush()
                category_map[cat.name] = cat
                print(f"  Created category: {cat.name}")
            else:
                category_map[existing.name] = existing

        # --- Books ---
        for book_data in BOOKS:
            existing = session.exec(
                select(Book).where(Book.title == book_data["title"])
            ).first()
            if existing is not None:
                print(f"  Book already exists: {book_data['title']}")
                continue

            # Resolve publisher
            publisher = publisher_map.get(book_data["publisher"])

            # Resolve series
            series = None
            series_index = None
            if book_data["series"]:
                series = series_map.get(book_data["series"][0])
                series_index = book_data["series"][1]

            book = Book(
                title=book_data["title"],
                subtitle=book_data["subtitle"],
                description=book_data["description"],
                language=book_data["language"],
                page_count=book_data["page_count"],
                published_date=book_data["published_date"],
                publisher_id=publisher.id if publisher else None,
                series_id=series.id if series else None,
                series_index=series_index,
                rating=book_data["rating"],
                is_public=True,
            )
            session.add(book)
            session.flush()
            print(f"  Created book: {book.title} (id={book.id})")

            # Authors (link table)
            for author_name, role in book_data["authors"]:
                author = author_map.get(author_name)
                if author:
                    link = BookAuthor(book_id=book.id, author_id=author.id, role=role)
                    session.add(link)

            # Tags
            for tag_name in book_data["tags"]:
                tag = tag_map.get(tag_name)
                if tag:
                    link = BookTag(book_id=book.id, tag_id=tag.id)
                    session.add(link)

            # Categories
            for cat_name in book_data["categories"]:
                cat = category_map.get(cat_name)
                if cat:
                    link = BookCategory(book_id=book.id, category_id=cat.id)
                    session.add(link)

            # Identifiers
            for id_type, id_value in book_data["identifiers"]:
                identifier = Identifier(
                    book_id=book.id,
                    type=id_type,
                    value=id_value,
                )
                session.add(identifier)

            # Formats
            for fmt, size in book_data["formats"]:
                book_format = BookFormat(
                    book_id=book.id,
                    format=fmt,
                    file_path=f"data/books/{book.id}/{book.title.replace(' ', '_')}.{fmt}",
                    file_size=size,
                    mime_type=(
                        "application/epub+zip" if fmt == "epub" else "application/pdf"
                    ),
                )
                session.add(book_format)

        session.commit()

    print("\nSeed completed successfully!")


if __name__ == "__main__":
    print("Seeding Folio database...\n")
    seed()
