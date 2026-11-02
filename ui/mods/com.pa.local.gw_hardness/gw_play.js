// Far systems: you keep one planet. Every other planet gets 3 or 4 enemy commanders.
(function () {
  if (window.__gwHardnessInstalled) {
    return;
  }
  window.__gwHardnessInstalled = true;

  var npcsPerOtherPlanet = function (planetCount) {
    return planetCount >= 5 ? 4 : 3;
  };

  var startingBodies = function (system) {
    var planets = system && system.planets;
    if (!planets) {
      return 0;
    }
    return _.filter(planets, function (planet) {
      return planet && planet.starting_planet;
    }).length;
  };

  var applyHardness = function (ref) {
    var config = ref && ref.config && ref.config();
    if (!config || !config.armies || startingBodies(config.system) < 2) {
      return;
    }

    var enemySlots = [];
    var mainEnemy = null;
    _.forEach(config.armies, function (army) {
      if (!army || army.alliance_group === 1 || !army.slots) {
        return;
      }
      if (!mainEnemy && army.alliance_group === 2) {
        mainEnemy = army;
      }
      _.forEach(army.slots, function (slot) {
        if (!slot || !slot.ai) {
          return;
        }
        slot.landing_policy = "off_player_planet";
        enemySlots.push({ army: army, slot: slot });
      });
    });

    if (!mainEnemy) {
      mainEnemy = _.find(config.armies, function (army) {
        return army && army.alliance_group !== 1 && army.slots && army.slots.length;
      });
    }
    if (!mainEnemy || !mainEnemy.slots.length || !mainEnemy.slots[0].ai) {
      return;
    }

    var planetCount = startingBodies(config.system);
    var perPlanet = npcsPerOtherPlanet(planetCount);
    var target = (planetCount - 1) * perPlanet;

    while (enemySlots.length < target) {
      var extra = _.cloneDeep(mainEnemy.slots[0]);
      extra.landing_policy = "off_player_planet";
      extra.name =
        (mainEnemy.slots[0].name || "Enemy") + " " + (enemySlots.length + 1);
      mainEnemy.slots.push(extra);
      enemySlots.push({ army: mainEnemy, slot: extra });
    }

    while (enemySlots.length > target) {
      var entry = enemySlots.pop();
      if (!entry || !entry.army || !entry.army.slots) {
        break;
      }
      entry.army.slots = _.without(entry.army.slots, entry.slot);
    }

    console.log(
      "Hardness spawn: " +
        planetCount +
        " planets, " +
        perPlanet +
        " enemies on each other planet (" +
        enemySlots.length +
        " total)"
    );
  };

  var wrapHire = function (GWReferee) {
    if (!GWReferee || !GWReferee.hire || GWReferee.hire.__hardnessWrapped) {
      return false;
    }
    var original = GWReferee.hire;
    var wrapped = function (game) {
      return original.call(this, game).then(function (ref) {
        try {
          applyHardness(ref);
        } catch (error) {
          console.error("Hardness spawn failed", error);
        }
        return ref;
      });
    };
    wrapped.__hardnessWrapped = true;
    GWReferee.hire = wrapped;
    console.log("Hardness spawn rules armed");
    return true;
  };

  var attempts = 0;
  var watch = function () {
    var loader = typeof requireGW === "function" ? requireGW : require;
    loader(["pages/gw_play/gw_referee"], function (GWReferee) {
      wrapHire(GWReferee);
      attempts += 1;
      // Overhaul replaces hire after this scene loads. Keep wrapping the latest hire.
      if (attempts < 40) {
        _.delay(watch, 250);
      }
    });
  };
  watch();

  var START_CARDS = 3;
  var PICKS = 2;
  var TECH_BANK = 40;
  var CARDS_OFFERED = 5;

  var setBank = function (GW) {
    if (GW && GW.balance) {
      GW.balance.initialCardSlots = TECH_BANK;
    }
  };

  // applyCards rebuilds maxCards from the commander card, which puts the bank back at 4.
  // Put it back to 40 after every rebuild, and also if it drops during that rebuild.
  var enforceBank = function (inventory) {
    if (!inventory || !inventory.maxCards || !inventory.cards) {
      return;
    }
    var floor = Math.max(TECH_BANK, inventory.cards().length);
    if (inventory.maxCards() !== floor) {
      inventory.maxCards(floor);
    }
  };

  var pinBank = function (inventory) {
    if (!inventory) {
      return;
    }
    enforceBank(inventory);
    if (!inventory.__hardnessBankSub && inventory.maxCards.subscribe) {
      inventory.__hardnessBankSub = true;
      inventory.maxCards.subscribe(function () {
        enforceBank(inventory);
      });
    }
    var proto = Object.getPrototypeOf(inventory);
    if (!proto || !proto.applyCards || proto.applyCards.__hardnessBank) {
      return;
    }
    var original = proto.applyCards;
    var wrapped = function (done) {
      var self = this;
      return original.call(self, function () {
        enforceBank(self);
        if (done) {
          done();
        }
      });
    };
    wrapped.__hardnessBank = true;
    proto.applyCards = wrapped;
  };

  var updatePickPrompt = function () {
    var picked = (model.hardnessPicks && model.hardnessPicks.length) || 0;
    var text =
      picked > 0
        ? "Select one more technology."
        : "Select two technologies.";
    $(".div_panel_secondary_msg > div").first().text(text);
    var cards = $(".div_card_bground .card");
    cards.removeClass("hardness-picked");
    if (picked) {
      cards.eq(model.hardnessPicks[0]).addClass("hardness-picked");
    }
  };

  if (!document.getElementById("hardness-pick-style")) {
    var style = document.createElement("style");
    style.id = "hardness-pick-style";
    style.textContent =
      ".hardness-picked { outline: 2px solid #e6c36a; outline-offset: 4px; }" +
      ".div_options_bar input { display: inline-block !important; margin-right: 8px; }";
    document.head.appendChild(style);
  }

  var wrapWin = function () {
    if (!model || !model.win || model.win.__hardnessPick) {
      return;
    }
    var original = model.win;
    var wrapped = function (selectedCardIndex) {
      if (selectedCardIndex === -1) {
        model.hardnessPicks = [];
        return original.call(model, selectedCardIndex);
      }
      var list = model.currentSystemCardList && model.currentSystemCardList();
      var view = list && list[selectedCardIndex];
      if (!list || list.length < PICKS || (view && view.isLoadout && view.isLoadout())) {
        model.hardnessPicks = [];
        return original.call(model, selectedCardIndex);
      }
      model.hardnessPicks = model.hardnessPicks || [];
      if (!model.hardnessPicks.length) {
        model.hardnessPicks = [selectedCardIndex];
        updatePickPrompt();
        return;
      }
      if (model.hardnessPicks[0] === selectedCardIndex) {
        model.hardnessPicks = [];
        updatePickPrompt();
        return;
      }
      var game = model.game();
      var star = game.galaxy().stars()[game.currentStar()];
      var firstCard = star && star.cardList()[model.hardnessPicks[0]];
      model.hardnessPicks = [];
      var winTurn = game.winTurn;
      game.winTurn = function (index, done) {
        game.winTurn = winTurn;
        return winTurn.call(game, index, done).then(function (didWin) {
          var inventory = game.inventory();
          if (
            !didWin ||
            !firstCard ||
            !firstCard.id ||
            inventory.hasCard(firstCard.id) ||
            !inventory.canFitCard(firstCard)
          ) {
            return didWin;
          }
          var added = $.Deferred();
          inventory.cards.push(firstCard);
          inventory.applyCards(function () {
            added.resolve(didWin);
          });
          return added.promise();
        });
      };
      return original.call(model, selectedCardIndex);
    };
    wrapped.__hardnessPick = true;
    model.win = wrapped;
  };

  var isLoadoutList = function (list) {
    var first = list && list[0];
    var id = first && (first.id || first);
    return typeof id === "string" && id.indexOf("_start_") !== -1;
  };

  var dealOffer = function (keepExisting) {
    var game = model && model.game && model.game();
    if (!game || !game.galaxy) {
      return;
    }
    var star = game.galaxy().stars()[game.currentStar()];
    var inventory = game.inventory && game.inventory();
    if (!star || !star.cardList || !inventory) {
      return;
    }
    var existing = star.cardList() || [];
    if (isLoadoutList(existing)) {
      return;
    }
    model.hardnessPicks = [];
    var need = keepExisting ? CARDS_OFFERED - existing.length : CARDS_OFFERED;
    if (need <= 0) {
      return;
    }
    if (!keepExisting) {
      existing = [];
      star.cardList([]);
    }
    var kept = existing.slice();
    var loader = typeof requireGW === "function" ? requireGW : require;
    loader(["pages/gw_start/gw_dealer"], function (dealer) {
      dealer
        .chooseCards({
          inventory: inventory,
          count: need,
          star: star,
          galaxy: game.galaxy(),
        })
        .then(function (cards) {
          var list = kept.slice();
          _.forEach(cards || [], function (card) {
            if (card && card.id && list.length < CARDS_OFFERED) {
              list.push(card);
            }
          });
          star.cardList(list);
          if (model.gwoOfferRerolls) {
            model.gwoOfferRerolls(true);
          }
          updatePickPrompt();
          console.log("Hardness offer: " + list.length + " cards");
        });
    });
  };

  var installRerollButton = function () {
    var bar = $(".div_options_bar");
    if (!bar.length) {
      return;
    }
    var gwoButton = bar.find("input[value='Reroll Tech']");
    if (gwoButton.length) {
      gwoButton.val("Reroll");
      return;
    }
    if (bar.find("#hardness-reroll").length || bar.find("input[value='Reroll']").length) {
      return;
    }
    var button = $(
      '<input type="button" id="hardness-reroll" value="Reroll" />'
    );
    button.on("click", function () {
      if (model.rerollTech) {
        model.rerollTech();
      }
    });
    bar.prepend(button);
  };

  var wrapOffer = function () {
    installRerollButton();
    if (!model || !model.explore || model.explore.__hardnessOffer) {
      if (model && model.rerollTech && !model.rerollTech.__hardnessReroll) {
        model.rerollTech = function () {
          if (model.scanning && model.scanning()) {
            return;
          }
          dealOffer(false);
        };
        model.rerollTech.__hardnessReroll = true;
      }
      return;
    }
    var originalExplore = model.explore;
    var wrappedExplore = function () {
      var result = originalExplore.apply(model, arguments);
      _.delay(function () {
        dealOffer(true);
      }, 2200);
      return result;
    };
    wrappedExplore.__hardnessOffer = true;
    model.explore = wrappedExplore;
    model.rerollTech = function () {
      if (model.scanning && model.scanning()) {
        return;
      }
      dealOffer(false);
    };
    model.rerollTech.__hardnessReroll = true;
  };

  var dealStartCards = function (attempt) {
    var game = model && model.game && model.game();
    if (!game || (game.isTutorial && game.isTutorial())) {
      if (attempt < 40) {
        _.delay(function () {
          dealStartCards(attempt + 1);
        }, 250);
      }
      return;
    }
    var galaxy = game.galaxy && game.galaxy();
    var origin = galaxy && galaxy.stars && galaxy.stars()[galaxy.origin()];
    var system = origin && origin.system && origin.system();
    var inventory = game.inventory && game.inventory();
    if (!system || !inventory) {
      if (attempt < 40) {
        _.delay(function () {
          dealStartCards(attempt + 1);
        }, 250);
      }
      return;
    }
    if (system.hardnessStartCards) {
      return;
    }
    var hasLoadout = _.some(inventory.cards(), function (card) {
      return card && card.id && card.id.indexOf("_start_") !== -1;
    });
    if (!hasLoadout) {
      if (attempt < 40) {
        _.delay(function () {
          dealStartCards(attempt + 1);
        }, 250);
      }
      return;
    }
    var wins = game.stats && game.stats().wins ? game.stats().wins() : 0;
    var ownedTech = _.filter(inventory.cards(), function (card) {
      return (
        card &&
        card.id &&
        card.id.indexOf("_start_") === -1 &&
        card.id !== "gwc_minion"
      );
    });
    if (wins > 0 || ownedTech.length) {
      system.hardnessStartCards = true;
      return;
    }
    var loader = typeof requireGW === "function" ? requireGW : require;
    loader(
      ["pages/gw_start/gw_dealer", "shared/gw_common"],
      function (dealer, GW) {
        if (system.hardnessStartCards) {
          return;
        }
        setBank(GW);
        pinBank(inventory);
        dealer
          .chooseCards({
            inventory: inventory,
            count: START_CARDS,
            star: origin,
            galaxy: galaxy,
          })
          .then(function (cards) {
            if (system.hardnessStartCards) {
              return;
            }
            system.hardnessStartCards = true;
            _.forEach(cards || [], function (card) {
              if (card && card.id) {
                inventory.cards.push(card);
              }
            });
            inventory.applyCards(function () {
              if (GW.manifest && GW.manifest.saveGame) {
                GW.manifest.saveGame(game);
              }
              console.log(
                "Hardness start cards: " + ((cards && cards.length) || 0)
              );
            });
          });
      }
    );
  };

  var cardAttempts = 0;
  var watchCards = function () {
    wrapWin();
    wrapOffer();
    if (model && model.game && model.game()) {
      pinBank(model.game().inventory());
    }
    cardAttempts += 1;
    if (cardAttempts < 40) {
      _.delay(watchCards, 250);
    }
  };
  watchCards();
  dealStartCards(0);
})();
