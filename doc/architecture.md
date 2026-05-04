# Iron-pess

## Цели

Основная - сделать оркестратор с возможность гибкой настройки workflow через Web UI. Workflow это граф из нескольких типов узлов(AI-Agent/Bash-script/Pull Request/etc) и статусов.

CLI:
```mermaid
graph LR
    CLI[CLI Entry] --> Loop[Issue Loop]
    Loop --> Selector[Workflow Selector]
    Selector --> Bugs[Fix Bugs]
    Selector --> Feature[Implement Feature]
    Selector --> Brainstorm[Brainstorm Idea]
```

Role-based workflow:
```mermaid
graph LR
    Issue --> BA[Bussines Analitic]
    BA --> TL[Team Lead]
    TL --> SWE1[Software Engeneer 1]
    TL --> SWE2[Software Engeneer 2]
    TL --> SWEN[Software Engeneer N]
    SWE1 --> PL[Pull Request]
    SWE2 --> PL[Pull Request]
    SWEN --> PL[Pull Request]
```

Дополнительная - довести до состояния, когда можно развивать проект только через создание задач в трекере. 

## Что успели реализовать:
 - CLI в котором обрабатывается только одна задача

```mermaid
graph LR
    CLI[CLI Entry] --> Issue
    Issue --> Workflow[Default Workflow]
```

 - Polling-режим с автоматическим выбором workflow по лейблам Linear-задачи

```mermaid
graph LR
    Poll[Poll Linear] --> Issue
    Issue --> Selector[Label → Workflow Mapping]
    Selector -->|label found| Mapped[Mapped Workflow]
    Selector -->|no match| Default[Default Workflow]
```

 - Простейщий Workflow без сложной ролевой модели

```mermaid
graph LR
    Issue --> Сlarification
    Сlarification --> Implementation
    Implementation --> PR[Pull Request]
```

 - Web UI в котором можно редактировать workflow и выгружать его ввиде json

![WebUI](./doc/web-ui.jpg)


## Технологический стек
JS/TS/Claude Code/ReactFlow/Linear
 
## Сложности:
 - Выбрать направление куда двигаться в сжатые сроки
 - Как лучше передавать состояние и артифакты внутри workflow
 - Как показывать текущее состояние workflow в UI
