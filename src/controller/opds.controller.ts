import { Manga } from '@/generated/prisma/client';
import { MangaService } from '@/service/manga.service';
import { TagService } from '@/service/tag.service';
import type { Request, Response } from 'express';
import { create } from 'xmlbuilder2';

const mangaService = new MangaService();
const tagService = new TagService();

const PAGE_SIZE = 10;

async function getTagsResContent(tags) {
  const tagUuidManga = new Map<string, Manga>();
  for (const tag of tags) {
    const manga = await mangaService.getLatestMangaByTagUuid(tag.uuid)
    if (!manga) {
      continue;
    }
    tagUuidManga.set(tag.uuid, manga);
  }
  return {
    feed: {
      '@xmlns': 'http://www.w3.org/2005/Atom',
      id: '',
      title: '',
      updated: new Date().toISOString(),
      author: { name: 'MangaDB' },
      link: [
        {
          '@rel': 'start',
          '@href': '/api/opds/v1.2/catalog',
          '@type': 'application/atom+xml;profile=opds-catalog;kind=navigation'
        },
      ],
      entry: tags.map(tag => {
        const manga = tagUuidManga.get(tag.uuid);
        return {
          id: tag.uuid,
          title: tag.name,
          link: [
            {
              '@type': 'image/jpeg',
              '@rel': 'http://opds-spec.org/image/thumbnail',
              '@href': `/api/file/mangas/${manga?.uuid}/pages/${manga?.cover ?? 0}`,
            },
            {
              '@type': 'image/jpeg',
              '@rel': 'http://opds-spec.org/image',
              '@href': `/api/file/mangas/${manga?.uuid}/pages/${manga?.cover ?? 0}`,
            },
            {
              '@type': 'application/atom+xml;profile=opds-catalog;kind=navigation',
              '@rel': 'subsection',
              '@href': `/api/opds/v1.2/tags/${tag.uuid}`,
            },
          ],
        }
      }),
    },
  };
}

async function getMangasResContent(mangas) {
  return {
    feed: {
      '@xmlns': 'http://www.w3.org/2005/Atom',
      id: '',
      title: '',
      updated: new Date().toISOString(),
      author: { name: 'MangaDB' },
      link: [
        {
          '@rel': 'start',
          '@href': '/api/opds/v1.2/catalog',
          '@type': 'application/atom+xml;profile=opds-catalog;kind=navigation'
        },
      ],
      entry: mangas.map(manga => {
        const mangaUuid = manga.uuid;
        return {
          id: mangaUuid,
          title: manga.displayTitle,
          summary: manga.mangaTags
            .filter(mangaTag => mangaTag.tag.tagType.name !== 'OTHER')
            .map(mangaTag => `${mangaTag.tag.tagType.name}:${mangaTag.tag.name}`)
            .join(','),
          content: manga.mangaTags
            .filter(mangaTag => mangaTag.tag.tagType.name === 'OTHER')
            .map(mangaTag => mangaTag.tag.name)
            .join(','),
          link: [
            {
              '@type': 'image/jpeg',
              '@rel': 'http://opds-spec.org/image/thumbnail',
              '@href': `/api/file/mangas/${mangaUuid}/pages/${manga.cover ?? 0}`,
            },
            {
              '@type': 'image/jpeg',
              '@rel': 'http://opds-spec.org/image',
              '@href': `/api/file/mangas/${mangaUuid}/pages/${manga.cover ?? 0}`,
            },
            {
              '@type': 'application/vnd.comicbook+zip',
              '@rel': 'http://opds-spec.org/acquisition',
              '@href': `/api/file/mangas/${mangaUuid}`,
            },
            {
              '@type': 'image/jpeg',
              '@rel': 'http://vaemendis.net/opds-pse/stream',
              '@href': `/api/file/mangas/${mangaUuid}/pages/{pageNumber}`,
              '@xmlns:pse': 'http://vaemendis.net/opds-pse/ns',
              '@pse:count': (manga.pages as string[]).length,
            }
          ],
        }
      }),
    },
  };
}

function getPage(query) {
  return typeof query === 'string' ? parseInt(query) : 1;
}

export class OpdsController {
  async getAllTagTypes(req: Request, res: Response) {
    const tagTypes = await tagService.getAllTagTypes();
    const entry = Object.values(tagTypes).map(tagType => {
      return {
        id: tagType.uuid,
        title: tagType.name,
        link: {
          '@type': 'application/atom+xml;profile=opds-catalog;kind=navigation',
          '@rel': 'subsection',
          '@href': `/api/opds/v1.2/tag_types/${tagType.name}`,
        },
      };
    });
    entry.push({
      id: '1',
      title: 'Latest',
      link: {
        '@type': 'application/atom+xml;profile=opds-catalog;kind=navigation',
        '@rel': 'subsection',
        '@href': `/api/opds/v1.2/mangas/latest`,
      },
    });
    const content = {
      feed: {
        '@xmlns': 'http://www.w3.org/2005/Atom',
        id: 'root',
        title: 'MangaDB OPDS Catalog',
        updated: new Date().toISOString(),
        author: { name: 'MangaDB' },
        link: [
          {
            '@rel': 'self',
            '@href': '/api/opds/v1.2/catalog',
            '@type': 'application/atom+xml;profile=opds-catalog;kind=navigation'
          },
          {
            '@rel': 'start',
            '@href': '/api/opds/v1.2/catalog',
            '@type': 'application/atom+xml;profile=opds-catalog;kind=navigation'
          },
          {
            '@rel': 'search',
            '@href': '/api/opds/v1.2/search',
            '@type': 'application/opensearchdescription+xml'
          },
        ],
        entry,
      },
    };
    res.type('application/atom+xml');
    res.send(create({ version: '1.0', encoding: 'UTF-8' }, content).end({ prettyPrint: true }));
  }

  async getTagsByTagType(req: Request, res: Response) {
    const tagType = req.params.tagType;
    if (!tagType) {
      return res.sendStatus(400);
    }
    const page = getPage(req.query.page);
    const [tags, total] = await tagService.getTagsByType(tagType, page-1, PAGE_SIZE);
    const content = await getTagsResContent(tags);
    content.feed.id = tagType;
    content.feed.title = tagType;
    content.feed.link.push({
      '@rel': 'self',
      '@href': req.originalUrl,
      '@type': 'application/atom+xml;profile=opds-catalog;kind=navigation'
    });
    if (page > 1) {
      content.feed.link.push({
        '@rel': 'previous',
        '@href': `/api/opds/v1.2/tag_types/${tagType}?page=${page-1}`,
        '@type': 'application/atom+xml;profile=opds-catalog;kind=navigation'
      });
    }
    if (total > page * PAGE_SIZE) {
      content.feed.link.push({
        '@rel': 'next',
        '@href': `/api/opds/v1.2/tag_types/${tagType}?page=${page+1}`,
        '@type': 'application/atom+xml;profile=opds-catalog;kind=navigation'
      });
    }
    res.type('application/atom+xml');
    res.send(create({ version: '1.0', encoding: 'UTF-8' }, content).end({ prettyPrint: true }));
  }

  async getMangasByTagUuid(req: Request, res: Response) {
    const tagUuid = req.params.tagUuid;
    if (!tagUuid) {
      return res.sendStatus(400);
    }
    const tag = await tagService.getTagByUuid(tagUuid);
    if (!tag) {
      return res.sendStatus(404);
    }
    const page = getPage(req.query.page);
    const [mangas, total] = await mangaService.getMangasByTagUuid(tagUuid, page-1, PAGE_SIZE);
    const content = await getMangasResContent(mangas);
    content.feed.id = tagUuid;
    content.feed.title = tag.name;
    content.feed.link.push({
      '@rel': 'self',
      '@href': req.originalUrl,
      '@type': 'application/atom+xml;profile=opds-catalog;kind=navigation'
    });
    if (page > 1) {
      content.feed.link.push({
        '@rel': 'previous',
        '@href': `/api/opds/v1.2/tags/${tagUuid}?page=${page-1}`,
        '@type': 'application/atom+xml;profile=opds-catalog;kind=navigation'
      });
    }
    if (total > page * PAGE_SIZE) {
      content.feed.link.push({
        '@rel': 'next',
        '@href': `/api/opds/v1.2/tags/${tagUuid}?page=${page+1}`,
        '@type': 'application/atom+xml;profile=opds-catalog;kind=navigation'
      });
    }
    res.type('application/atom+xml');
    res.send(create({ version: '1.0', encoding: 'UTF-8' }, content).end({ prettyPrint: true }));
  }

  async search(req: Request, res: Response) {
    const content = {
      OpenSearchDescription: {
        '@xmlns': 'http://a9.com/-/spec/opensearch/1.1/',
        ShortName: 'Search',
        Description: 'Search',
        InputEncoding: 'UTF-8',
        OutputEncoding: 'UTF-8',
        Url: {
          '@template': '/api/opds/v1.2/tags?search={searchTerms}',
          '@type': 'application/atom+xml;profile=opds-catalog;kind=acquisition'
        },
      },
    };
    res.type('application/atom+xml');
    res.send(create({ version: '1.0', encoding: 'UTF-8' }, content).end({ prettyPrint: true }));
  }

  async getTagsByKeyword(req: Request, res: Response) {
    const keyword = req.query.search;
    if (typeof keyword !== 'string') {
      return res.sendStatus(400);
    }
    const tags = await tagService.getTagsByKeyword(keyword);
    const content = await getTagsResContent(tags);
    content.feed.id = keyword;
    content.feed.title = keyword;
    content.feed.link.push({
      '@rel': 'self',
      '@href': req.originalUrl,
      '@type': 'application/atom+xml;profile=opds-catalog;kind=navigation'
    });
    content.feed.entry.unshift({
      id: '1',
      title: 'Search in title',
      link: {
        '@type': 'application/atom+xml;profile=opds-catalog;kind=navigation',
        '@rel': 'subsection',
        '@href': `/api/opds/v1.2/mangas?search=${keyword}`,
      },
    });
    res.type('application/atom+xml');
    res.send(create({ version: '1.0', encoding: 'UTF-8' }, content).end({ prettyPrint: true }));
  }

  async getMangasByKeyword(req: Request, res: Response) {
    const keyword = req.query.search;
    if (typeof keyword !== 'string') {
      return res.sendStatus(400);
    }
    const mangas = await mangaService.getMangasByKeyword(keyword);
    const content = await getMangasResContent(mangas);
    content.feed.id = keyword;
    content.feed.title = keyword;
    content.feed.link.push({
      '@rel': 'self',
      '@href': req.originalUrl,
      '@type': 'application/atom+xml;profile=opds-catalog;kind=navigation'
    });
    res.type('application/atom+xml');
    res.send(create({ version: '1.0', encoding: 'UTF-8' }, content).end({ prettyPrint: true }));
  }

  async getLatestMangas(req: Request, res: Response) {
    const page = getPage(req.query.page);
    const [mangas, total] = await mangaService.getLatestMangas(page-1, PAGE_SIZE);
    const content = await getMangasResContent(mangas);
    content.feed.id = 'latest';
    content.feed.title = 'latest';
    content.feed.link.push({
      '@rel': 'self',
      '@href': req.originalUrl,
      '@type': 'application/atom+xml;profile=opds-catalog;kind=navigation'
    });
    if (page > 1) {
      content.feed.link.push({
        '@rel': 'previous',
        '@href': `/api/opds/v1.2/mangas/latest?page=${page-1}`,
        '@type': 'application/atom+xml;profile=opds-catalog;kind=navigation'
      });
    }
    if (total > page * PAGE_SIZE) {
      content.feed.link.push({
        '@rel': 'next',
        '@href': `/api/opds/v1.2/mangas/latest?page=${page+1}`,
        '@type': 'application/atom+xml;profile=opds-catalog;kind=navigation'
      });
    }
    res.type('application/atom+xml');
    res.send(create({ version: '1.0', encoding: 'UTF-8' }, content).end({ prettyPrint: true }));
  }
}
